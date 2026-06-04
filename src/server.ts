// Builds the MCP server and registers tools. Each tool handler is wrapped so a
// thrown ToolError becomes a structured { error, message, ... } result with
// isError:true. Tools carry annotations (readOnly/openWorld/destructive) and an
// outputSchema describing their structuredContent — both are required by the
// ChatGPT app review, and the outputSchema also helps models reason about
// results. The schemas below match exactly what each handler returns.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config.js';
import { ToolError } from './errors.js';
import { log } from './logger.js';
import {
  SEARCH_PLANS_NAME, searchPlansDescription, searchPlansInput, makeSearchPlansHandler,
} from './tools/search_plans.js';
import {
  GET_QUOTE_NAME, getQuoteDescription, getQuoteInput, makeGetQuoteHandler,
} from './tools/get_quote.js';
import {
  PURCHASE_NAME, purchaseDescription, purchaseInput, makePurchaseHandler,
} from './tools/purchase.js';
import {
  GET_ACTIVATION_NAME, getActivationDescription, getActivationInput, makeGetActivationHandler,
} from './tools/get_activation.js';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

type ToolResult = {
  content: ContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

// Shared plan shape (what normalizePlan returns) — used by search_plans + get_quote.
const planShape = {
  plan_id: z.string(),
  country: z.string(),
  country_name: z.string(),
  data_gb: z.number().nullable(),
  duration_days: z.number(),
  price: z.number(),
  currency: z.string(),
  network_carriers: z.array(z.string()),
  unlimited_voice: z.boolean().optional(),
  notes: z.string().optional(),
};

const searchPlansOutput = {
  plans: z.array(z.object(planShape)),
  meta: z.object({ total_results: z.number(), returned_at: z.string(), source: z.string() }),
};

const getQuoteOutput = {
  plan: z.object(planShape),
  total: z.object({
    subtotal: z.number(), taxes: z.number(), fees: z.number(), final: z.number(), currency: z.string(),
  }),
  quote_expires_at: z.string(),
};

const purchaseOutput = {
  order_id: z.string(),
  status: z.string(),
  payment_url: z.string().nullable().optional(),
  receipt_url: z.string().nullable().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  idempotency_key: z.string().optional(),
  idempotent: z.boolean().optional(),
};

const getActivationOutput = {
  status: z.string(),
  qr_code_png_base64: z.string().nullable().optional(),
  activation_code: z.string().nullable().optional(),
  install_instructions: z.object({ ios: z.string(), android: z.string() }),
  expires_at: z.string().nullable().optional(),
};

function guard<A>(fn: (args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await fn(args);
    } catch (e) {
      const shape =
        e instanceof ToolError
          ? e.toShape()
          : { error: 'backend_error' as const, message: (e as Error)?.message || String(e) };
      log.error('tool failed', shape);
      return { content: [{ type: 'text', text: JSON.stringify(shape, null, 2) }], isError: true };
    }
  };
}

export function buildServer(cfg: Config): McpServer {
  const server = new McpServer({ name: 'meisimusa-mcp', version: cfg.version });

  server.registerTool(
    SEARCH_PLANS_NAME,
    {
      title: 'Search eSIM plans',
      description: searchPlansDescription,
      inputSchema: searchPlansInput,
      outputSchema: searchPlansOutput,
      annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    },
    guard(makeSearchPlansHandler(cfg)),
  );

  server.registerTool(
    GET_QUOTE_NAME,
    {
      title: 'Get a price quote',
      description: getQuoteDescription,
      inputSchema: getQuoteInput,
      outputSchema: getQuoteOutput,
      annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    },
    guard(makeGetQuoteHandler(cfg)),
  );

  // Info-only mode (ChatGPT): stop here — no purchase / activation tools.
  if (cfg.infoOnly) return server;

  server.registerTool(
    PURCHASE_NAME,
    {
      title: 'Purchase an eSIM',
      description: purchaseDescription,
      inputSchema: purchaseInput,
      outputSchema: purchaseOutput,
      annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
    },
    guard(makePurchaseHandler(cfg)),
  );

  server.registerTool(
    GET_ACTIVATION_NAME,
    {
      title: 'Get activation QR',
      description: getActivationDescription,
      inputSchema: getActivationInput,
      outputSchema: getActivationOutput,
      annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    },
    guard(makeGetActivationHandler(cfg)),
  );

  return server;
}
