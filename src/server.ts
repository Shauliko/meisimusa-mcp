// Builds the MCP server and registers every tool. Each carries annotations
// (readOnly/openWorld/destructive) and an outputSchema matching its returned
// structuredContent — both required by the ChatGPT app review.
//
// Tool set:
//   Retail, no key (also exposed in info-only / ChatGPT directory, and in the
//   Claude Connectors Directory build at /mcp-directory, where every plan
//   carries a buy_url instead of an in-chat purchase):
//     search_plans, get_quote, search_us_numbers
//   Retail, transactional (full server only, Claude / Grok / direct):
//     purchase, get_activation, topup_lookup, topup_start
//   Your numbers, API key required (full server only):
//     get_account, get_number_pricing, buy_numbers, get_order,
//     list_my_numbers, read_messages, wait_for_message, send_message

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config.js';
import { ToolError } from './errors.js';
import { log } from './logger.js';
import { SEARCH_PLANS_NAME, searchPlansDescription, searchPlansDirectoryDescription, searchPlansInput, makeSearchPlansHandler } from './tools/search_plans.js';
import { GET_QUOTE_NAME, getQuoteDescription, getQuoteDirectoryDescription, getQuoteInput, makeGetQuoteHandler } from './tools/get_quote.js';
import { PURCHASE_NAME, purchaseDescription, purchaseInput, makePurchaseHandler } from './tools/purchase.js';
import { GET_ACTIVATION_NAME, getActivationDescription, getActivationInput, makeGetActivationHandler } from './tools/get_activation.js';
import { SEARCH_US_NUMBERS_NAME, searchUsNumbersDescription, searchUsNumbersDirectoryDescription, searchUsNumbersInput, makeSearchUsNumbersHandler } from './tools/search_us_numbers.js';
import { TOPUP_LOOKUP_NAME, topupLookupDescription, topupLookupInput, makeTopupLookupHandler } from './tools/topup_lookup.js';
import { TOPUP_START_NAME, topupStartDescription, topupStartInput, makeTopupStartHandler } from './tools/topup_start.js';
import { GET_ACCOUNT_NAME, getAccountDescription, getAccountInput, makeGetAccountHandler } from './tools/get_account.js';
import { GET_NUMBER_PRICING_NAME, getNumberPricingDescription, getNumberPricingInput, makeGetNumberPricingHandler } from './tools/get_number_pricing.js';
import { BUY_NUMBERS_NAME, buyNumbersDescription, buyNumbersInput, makeBuyNumbersHandler } from './tools/buy_numbers.js';
import { GET_ORDER_NAME, getOrderDescription, getOrderInput, makeGetOrderHandler } from './tools/get_order.js';
import { LIST_MY_NUMBERS_NAME, listMyNumbersDescription, listMyNumbersInput, makeListMyNumbersHandler } from './tools/list_my_numbers.js';
import { READ_MESSAGES_NAME, readMessagesDescription, readMessagesInput, makeReadMessagesHandler } from './tools/read_messages.js';
import { WAIT_FOR_MESSAGE_NAME, waitForMessageDescription, waitForMessageInput, makeWaitForMessageHandler } from './tools/wait_for_message.js';
import { SEND_MESSAGE_NAME, sendMessageDescription, sendMessageInput, makeSendMessageHandler } from './tools/send_message.js';
import { GET_AI_LINE_OFFER_NAME, getAiLineOfferDescription, getAiLineOfferInput, aiLineOfferOutput, makeGetAiLineOfferHandler } from './tools/get_ai_line_offer.js';

// What a client reads about the directory build before it calls anything.
// Lines first, travel second. Nothing here sells in-chat.
export const DIRECTORY_INSTRUCTIONS =
  'MeiSIM USA rents real US phone lines for AI agents: a real US mobile number on a national carrier, with inbound texts ' +
  'delivered to a webhook or read over the API, and voice over SIP with the number as caller ID. Built for voice agents, ' +
  'phone assistants, companion apps and SMS customer service. Start with get_ai_line_offer for the live monthly prices, ' +
  'the first-term minimum, what a line includes, delivery time and how many numbers are ready now; send people who want ' +
  'a line to its apply_url. Second, travel eSIM data plans for about 200 countries (search_plans) and retail US ' +
  'phone plans for a handset (search_us_numbers), with get_quote for one plan\'s price. Every plan carries a buy_url that ' +
  'opens that exact plan on meisimusa.com. This connector only reads the public catalog: it cannot open an account, ' +
  'buy, top up, send or read messages, and it holds no customer data.';

type ContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type ToolResult = { content: ContentBlock[]; structuredContent?: Record<string, unknown>; isError?: boolean; };

const RO = { readOnlyHint: true, openWorldHint: true, destructiveHint: false };
const RW = { readOnlyHint: false, openWorldHint: true, destructiveHint: false };

const planShape = {
  plan_id: z.string(), country: z.string(), country_name: z.string(), data_gb: z.number().nullable(),
  duration_days: z.number(), price: z.number(), currency: z.string(),
  network_carriers: z.array(z.string()), unlimited_voice: z.boolean().optional(), notes: z.string().optional(),
  // search_plans adds these (strict clients reject undeclared fields):
  // coverage = country-specific or regional; coverage_countries = how many
  // countries the plan covers; vendor = the catalog supplier label, returned
  // on /mcp and /mcp-info only, never on the public directory build.
  coverage: z.enum(['country', 'regional']).optional(),
  coverage_countries: z.number().int().optional(),
  vendor: z.string().optional(),
  // Directory build only: where a person buys this exact plan on the website.
  buy_url: z.string().optional(),
};
const metaShape = z.object({ total_results: z.number(), returned_at: z.string().optional(), source: z.string() });

const searchPlansOutput = { plans: z.array(z.object(planShape)), meta: metaShape, how_to_buy: z.string().optional() };
const getQuoteOutput = {
  plan: z.object(planShape),
  total: z.object({ subtotal: z.number(), taxes: z.number(), fees: z.number(), final: z.number(), currency: z.string() }),
  quote_expires_at: z.string(),
  buy_url: z.string().optional(),
  how_to_buy: z.string().optional(),
};
const usNumbersOutput = {
  plans: z.array(z.object({
    plan_id: z.string(), carrier: z.string(), title: z.string(), data_gb: z.number().nullable(),
    duration_days: z.number(), price: z.number(), currency: z.string(), voice: z.string(), sms: z.string(),
    includes_us_number: z.boolean(), buy_url: z.string().optional(),
  })),
  meta: metaShape,
  how_to_buy: z.string().optional(),
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

// ── Your numbers (API key) ──
const numberShape = z.object({
  number: z.string(), e164: z.string(), label: z.string().nullable(), status: z.string(), voice: z.boolean(),
  billing: z.string(), paid_through: z.string().nullable(), auto_renew: z.boolean(), stops_at_local: z.string().nullable(),
  billing_note: z.string().nullable(), order_id: z.string().nullable(), customer_reference: z.string().nullable(),
  last_message_at: z.string().nullable(),
});
const messageShape = z.object({ id: z.string(), number: z.string(), from: z.string(), text: z.string(), received_at: z.string().nullable() });
const orderShape = {
  order_id: z.string(), customer_reference: z.string().nullable(), status: z.string(),
  ordered: z.number(), delivered: z.number(), outstanding: z.number(), numbers: z.array(z.string()),
  billing: z.string(), voice: z.boolean(), days_paid: z.number().nullable(), charged_usd: z.number().nullable(),
  refunded_usd: z.number(), created_at: z.string().nullable(), completed_at: z.string().nullable(),
};
const accountOutput = {
  company: z.string().nullable(), email: z.string().nullable(), status: z.string().nullable(), balance_usd: z.number(),
  currency: z.string(), daily_line_limit: z.number().nullable(), lines_remaining_today: z.number().nullable(), topup_note: z.string(),
};
const pricingOutput = {
  can_order: z.boolean(), reason: z.string().optional(), currency: z.string(),
  monthly: z.object({ first_month_usd: z.number().nullable(), renew_price_usd: z.number().nullable(), min_months: z.number(), voice_price_usd: z.number().nullable() }).optional(),
  daily: z.object({
    available: z.boolean(), price_usd: z.number().nullable(), voice_price_usd: z.number().nullable(), min_days: z.number().nullable(),
    activation_fee_usd: z.number().nullable(), voice_activation_fee_usd: z.number().nullable(),
    ready_now: z.object({ sms: z.number(), voice: z.number() }).nullable(), note: z.string().nullable(),
  }).optional(),
  voice_available: z.boolean().optional(), voice_note: z.string().nullable().optional(),
};
const buyNumbersOutput = { ...orderShape, duplicate: z.boolean(), note: z.string() };
const listNumbersOutput = { numbers: z.array(numberShape), total: z.number(), next_offset: z.number().nullable(), incoming: z.array(z.any()).optional(), note: z.string().optional() };
const readMessagesOutput = { messages: z.array(messageShape), count: z.number(), newest_received_at: z.string().nullable(), note: z.string().optional() };
const waitOutput = { received: z.boolean(), messages: z.array(messageShape), waited_seconds: z.number(), since: z.string(), note: z.string().optional() };
const sendOutput = { sent: z.boolean(), from: z.string(), to: z.string(), note: z.string().nullable() };

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
  const server = new McpServer({ name: 'meisimusa-mcp', version: cfg.version }, cfg.directory ? { instructions: DIRECTORY_INSTRUCTIONS } : undefined);

  // ── Claude Connectors Directory build: four public read-only tools, lines
  // first, every plan with a buy_url, nothing that moves money or touches an
  // account. ──
  if (cfg.directory) {
    const dcfg: Config = { ...cfg, apiKey: undefined, directory: true };
    server.registerTool(GET_AI_LINE_OFFER_NAME,
      { title: 'Get the AI phone-line offer', description: getAiLineOfferDescription, inputSchema: getAiLineOfferInput, outputSchema: aiLineOfferOutput, annotations: RO },
      guard(makeGetAiLineOfferHandler(dcfg)));
    server.registerTool(SEARCH_US_NUMBERS_NAME,
      { title: 'Search US phone-number plans', description: searchUsNumbersDirectoryDescription, inputSchema: searchUsNumbersInput, outputSchema: usNumbersOutput, annotations: RO },
      guard(makeSearchUsNumbersHandler(dcfg)));
    server.registerTool(SEARCH_PLANS_NAME,
      { title: 'Search travel eSIM plans', description: searchPlansDirectoryDescription, inputSchema: searchPlansInput, outputSchema: searchPlansOutput, annotations: RO },
      guard(makeSearchPlansHandler(dcfg)));
    server.registerTool(GET_QUOTE_NAME,
      { title: 'Get a price quote and buy link', description: getQuoteDirectoryDescription, inputSchema: getQuoteInput, outputSchema: getQuoteOutput, annotations: RO },
      guard(makeGetQuoteHandler(dcfg)));
    return server;
  }

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

  if (cfg.infoOnly) return server;

  // ── Transactional + status (full server only) ──
  server.registerTool(PURCHASE_NAME,
    { title: 'Purchase an eSIM or US number', description: purchaseDescription, inputSchema: purchaseInput, outputSchema: purchaseOutput, annotations: RW },
    guard(makePurchaseHandler(cfg)));
  server.registerTool(GET_ACTIVATION_NAME,
    { title: 'Get activation QR', description: getActivationDescription, inputSchema: getActivationInput, outputSchema: activationOutput, annotations: RO },
    guard(makeGetActivationHandler(cfg)));
  server.registerTool(TOPUP_LOOKUP_NAME,
    { title: 'Look up a line to top up', description: topupLookupDescription, inputSchema: topupLookupInput, outputSchema: topupLookupOutput, annotations: RO },
    guard(makeTopupLookupHandler(cfg)));
  server.registerTool(TOPUP_START_NAME,
    { title: 'Start a top-up', description: topupStartDescription, inputSchema: topupStartInput, outputSchema: topupStartOutput, annotations: RW },
    guard(makeTopupStartHandler(cfg)));

  // ── Your numbers (API key; the key is the account) ──
  server.registerTool(GET_ACCOUNT_NAME,
    { title: 'My MeiSIM account and balance', description: getAccountDescription, inputSchema: getAccountInput, outputSchema: accountOutput, annotations: RO },
    guard(makeGetAccountHandler(cfg)));
  server.registerTool(GET_NUMBER_PRICING_NAME,
    { title: 'Price of a new number', description: getNumberPricingDescription, inputSchema: getNumberPricingInput, outputSchema: pricingOutput, annotations: RO },
    guard(makeGetNumberPricingHandler(cfg)));
  server.registerTool(BUY_NUMBERS_NAME,
    { title: 'Buy US numbers (wallet)', description: buyNumbersDescription, inputSchema: buyNumbersInput, outputSchema: buyNumbersOutput, annotations: RW },
    guard(makeBuyNumbersHandler(cfg)));
  server.registerTool(GET_ORDER_NAME,
    { title: 'Check a number order', description: getOrderDescription, inputSchema: getOrderInput, outputSchema: orderShape, annotations: RO },
    guard(makeGetOrderHandler(cfg)));
  server.registerTool(LIST_MY_NUMBERS_NAME,
    { title: 'List my numbers', description: listMyNumbersDescription, inputSchema: listMyNumbersInput, outputSchema: listNumbersOutput, annotations: RO },
    guard(makeListMyNumbersHandler(cfg)));
  server.registerTool(READ_MESSAGES_NAME,
    { title: 'Read received texts', description: readMessagesDescription, inputSchema: readMessagesInput, outputSchema: readMessagesOutput, annotations: RO },
    guard(makeReadMessagesHandler(cfg)));
  server.registerTool(WAIT_FOR_MESSAGE_NAME,
    { title: 'Wait for the next text', description: waitForMessageDescription, inputSchema: waitForMessageInput, outputSchema: waitOutput, annotations: RO },
    guard(makeWaitForMessageHandler(cfg)));
  server.registerTool(SEND_MESSAGE_NAME,
    { title: 'Send a text', description: sendMessageDescription, inputSchema: sendMessageInput, outputSchema: sendOutput, annotations: RW },
    guard(makeSendMessageHandler(cfg)));

  return server;
}
