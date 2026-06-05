// Builds the MCP server and registers every tool. Each carries annotations
// (readOnly/openWorld/destructive) and an outputSchema matching its returned
// structuredContent — both required by the ChatGPT app review.
//
// Tool set:
//   Discovery (read-only — also exposed in info-only / ChatGPT directory):
//     search_plans, get_quote, search_us_numbers, search_sms_services
//   Transactional + status (full server only — Claude / Grok / direct):
//     purchase, get_activation, buy_sms_number, get_sms, topup_lookup, topup_start

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config.js';
import { ToolError } from './errors.js';
import { log } from './logger.js';
import { SEARCH_PLANS_NAME, searchPlansDescription, searchPlansInput, makeSearchPlansHandler } from './tools/search_plans.js';
import { GET_QUOTE_NAME, getQuoteDescription, getQuoteInput, makeGetQuoteHandler } from './tools/get_quote.js';
import { PURCHASE_NAME, purchaseDescription, purchaseInput, makePurchaseHandler } from './tools/purchase.js';
import { GET_ACTIVATION_NAME, getActivationDescription, getActivationInput, makeGetActivationHandler } from './tools/get_activation.js';
import { SEARCH_US_NUMBERS_NAME, searchUsNumbersDescription, searchUsNumbersInput, makeSearchUsNumbersHandler } from './tools/search_us_numbers.js';
import { SEARCH_SMS_SERVICES_NAME, searchSmsServicesDescription, searchSmsServicesInput, makeSearchSmsServicesHandler } from './tools/search_sms_services.js';
import { BUY_SMS_NUMBER_NAME, buySmsNumberDescription, buySmsNumberInput, makeBuySmsNumberHandler } from './tools/buy_sms_number.js';
import { GET_SMS_NAME, getSmsDescription, getSmsInput, makeGetSmsHandler } from './tools/get_sms.js';
import { TOPUP_LOOKUP_NAME, topupLookupDescription, topupLookupInput, makeTopupLookupHandler } from './tools/topup_lookup.js';
import { TOPUP_START_NAME, topupStartDescription, topupStartInput, makeTopupStartHandler } from './tools/topup_start.js';

type ContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type ToolResult = { content: ContentBlock[]; structuredContent?: Record<string, unknown>; isError?: boolean; };

const RO = { readOnlyHint: true, openWorldHint: true, destructiveHint: false };
const RW = { readOnlyHint: false, openWorldHint: true, destructiveHint: false };

const planShape = {
  plan_id: z.string(), country: z.string(), country_name: z.string(), data_gb: z.number().nullable(),
  duration_days: z.number(), price: z.number(), currency: z.string(),
  network_carriers: z.array(z.string()), unlimited_voice: z.boolean().optional(), notes: z.string().optional(),
};
const metaShape = z.object({ total_results: z.number(), returned_at: z.string().optional(), source: z.string() });

const searchPlansOutput = { plans: z.array(z.object(planShape)), meta: metaShape };
const getQuoteOutput = {
  plan: z.object(planShape),
  total: z.object({ subtotal: z.number(), taxes: z.number(), fees: z.number(), final: z.number(), currency: z.string() }),
  quote_expires_at: z.string(),
};
const usNumbersOutput = {
  plans: z.array(z.object({
    plan_id: z.string(), carrier: z.string(), title: z.string(), data_gb: z.number().nullable(),
    duration_days: z.number(), price: z.number(), currency: z.string(), voice: z.string(), sms: z.string(),
    includes_us_number: z.boolean(),
  })),
  meta: metaShape,
};
const smsServicesOutput = {
  services: z.array(z.object({
    service_id: z.number(), name: z.string(), label: z.string(), capability: z.string(),
    duration_days: z.number(), price: z.number(), currency: z.string(), featured: z.boolean(),
  })),
  meta: z.object({ total_results: z.number(), total_available: z.number(), source: z.string() }),
};
const purchaseOutput = {
  order_id: z.string(), status: z.string(), payment_url: z.string().nullable().optional(),
  receipt_url: z.string().nullable().optional(), message: z.string().optional(), error: z.string().optional(),
  idempotency_key: z.string().optional(), idempotent: z.boolean().optional(),
};
const activationOutput = {
  status: z.string(), qr_code_png_base64: z.string().nullable().optional(), activation_code: z.string().nullable().optional(),
  install_instructions: z.object({ ios: z.string(), android: z.string() }), expires_at: z.string().nullable().optional(),
};
const buySmsOutput = {
  order_id: z.string(), status: z.string(), payment_url: z.string().nullable().optional(),
  amount: z.number(), currency: z.string(), message: z.string().optional(), error: z.string().optional(),
};
const getSmsOutput = {
  status: z.string(), assigned_number: z.string().nullable(), expires_at: z.string().nullable().optional(),
  messages: z.array(z.object({ from: z.string(), body: z.string(), code: z.string().nullable(), received_at: z.string().nullable() })),
  latest_code: z.string().nullable().optional(), note: z.string().optional(),
};
const topupLookupOutput = {
  lines: z.array(z.object({
    line_type: z.string(), line_label: z.string(), phone: z.string().nullable(), iccid: z.string().nullable(),
    carrier: z.string().nullable(), carrier_id: z.number().nullable(), source_order_id: z.string().nullable(),
    plan_title: z.string().nullable(),
    topups: z.array(z.object({
      product_id: z.string(), description: z.string(), data: z.string(), validity: z.string(),
      price: z.number(), is_range: z.boolean(), min: z.number().optional(), max: z.number().optional(),
    })),
  })),
  hint: z.string().optional(),
};
const topupStartOutput = {
  order_id: z.string(), status: z.string(), payment_url: z.string().nullable().optional(),
  amount: z.number(), currency: z.string(), product: z.string().optional(), message: z.string().optional(), error: z.string().optional(),
};

function guard<A>(fn: (args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await fn(args);
    } catch (e) {
      const shape = e instanceof ToolError ? e.toShape() : { error: 'backend_error' as const, message: (e as Error)?.message || String(e) };
      log.error('tool failed', shape);
      return { content: [{ type: 'text', text: JSON.stringify(shape, null, 2) }], isError: true };
    }
  };
}

export function buildServer(cfg: Config): McpServer {
  const server = new McpServer({ name: 'meisimusa-mcp', version: cfg.version });

  // ── Discovery (read-only; also in info-only / ChatGPT directory) ──
  server.registerTool(SEARCH_PLANS_NAME,
    { title: 'Search travel eSIM plans', description: searchPlansDescription, inputSchema: searchPlansInput, outputSchema: searchPlansOutput, annotations: RO },
    guard(makeSearchPlansHandler(cfg)));
  server.registerTool(GET_QUOTE_NAME,
    { title: 'Get a price quote', description: getQuoteDescription, inputSchema: getQuoteInput, outputSchema: getQuoteOutput, annotations: RO },
    guard(makeGetQuoteHandler(cfg)));
  server.registerTool(SEARCH_US_NUMBERS_NAME,
    { title: 'Search US phone-number plans', description: searchUsNumbersDescription, inputSchema: searchUsNumbersInput, outputSchema: usNumbersOutput, annotations: RO },
    guard(makeSearchUsNumbersHandler(cfg)));
  server.registerTool(SEARCH_SMS_SERVICES_NAME,
    { title: 'Search SMS-verification services', description: searchSmsServicesDescription, inputSchema: searchSmsServicesInput, outputSchema: smsServicesOutput, annotations: RO },
    guard(makeSearchSmsServicesHandler(cfg)));

  if (cfg.infoOnly) return server;

  // ── Transactional + status (full server only) ──
  server.registerTool(PURCHASE_NAME,
    { title: 'Purchase an eSIM or US number', description: purchaseDescription, inputSchema: purchaseInput, outputSchema: purchaseOutput, annotations: RW },
    guard(makePurchaseHandler(cfg)));
  server.registerTool(GET_ACTIVATION_NAME,
    { title: 'Get activation QR', description: getActivationDescription, inputSchema: getActivationInput, outputSchema: activationOutput, annotations: RO },
    guard(makeGetActivationHandler(cfg)));
  server.registerTool(BUY_SMS_NUMBER_NAME,
    { title: 'Buy an SMS verification number', description: buySmsNumberDescription, inputSchema: buySmsNumberInput, outputSchema: buySmsOutput, annotations: RW },
    guard(makeBuySmsNumberHandler(cfg)));
  server.registerTool(GET_SMS_NAME,
    { title: 'Read received SMS / code', description: getSmsDescription, inputSchema: getSmsInput, outputSchema: getSmsOutput, annotations: RO },
    guard(makeGetSmsHandler(cfg)));
  server.registerTool(TOPUP_LOOKUP_NAME,
    { title: 'Look up a line to top up', description: topupLookupDescription, inputSchema: topupLookupInput, outputSchema: topupLookupOutput, annotations: RO },
    guard(makeTopupLookupHandler(cfg)));
  server.registerTool(TOPUP_START_NAME,
    { title: 'Start a top-up', description: topupStartDescription, inputSchema: topupStartInput, outputSchema: topupStartOutput, annotations: RW },
    guard(makeTopupStartHandler(cfg)));

  return server;
}
