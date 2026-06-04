// Tool 2: get_quote — confirm the price for a plan before buying.
// Wraps GET /mm/products/:productId (public, USD). With the retail catalog
// there IS a lookup-by-id, so this matches the spec's plan_id-only input.
// Retail prices have no separate tax/fee line, so those are 0 and final ==
// subtotal. The quote_expires_at is an advisory client-side TTL.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { ToolError } from '../errors.js';
import { normalizePlan, type RetailProduct } from '../retail.js';

export const GET_QUOTE_NAME = 'get_quote';

export const getQuoteDescription =
  'Confirm the current USD price for a specific eSIM plan before purchasing. Returns the full plan ' +
  'plus a price breakdown and a short-lived quote. Call after search_plans, before purchase.';

export const getQuoteInput = {
  plan_id: z.string().describe('The plan_id (productId) returned by search_plans.'),
};

const QUOTE_TTL_MINUTES = 15;

export function makeGetQuoteHandler(cfg: Config) {
  return async (args: { plan_id: string }) => {
    const raw = await callBackend<{ product?: RetailProduct }>(cfg, {
      method: 'GET',
      path: `/mm/products/${encodeURIComponent(args.plan_id)}`,
    });

    const plan = raw?.product ? normalizePlan(raw.product) : null;
    if (!plan) {
      throw new ToolError('not_found', `Plan "${args.plan_id}" not found. Re-run search_plans.`, { status: 404 });
    }

    const price = plan.price;
    const result = {
      plan,
      total: { subtotal: price, taxes: 0, fees: 0, final: price, currency: plan.currency },
      quote_expires_at: new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000).toISOString(),
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  };
}
