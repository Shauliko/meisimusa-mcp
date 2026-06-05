// Tool: search_us_numbers — real US phone-number plans (calls/texts/data on a
// genuine US carrier line, not a data-only travel eSIM). These are the p3:
// PrepaidIQ products inside /mm/products?country=US, flagged PRODUCT_TYPE=US_NUMBER.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { detail, parseDataGb, parseDurationDays, type RetailProduct } from '../retail.js';

export const SEARCH_US_NUMBERS_NAME = 'search_us_numbers';

export const searchUsNumbersDescription =
  'Find real US phone-number plans (a genuine US carrier line with calls, texts, and data, no SSN or contract). ' +
  'Use this when the user wants an actual US number, not just travel data. Returns a plan_id for purchase.';

export const searchUsNumbersInput = {
  max_price_usd: z.number().positive().optional().describe('Optional max monthly price in USD.'),
};

function isUsNumber(p: RetailProduct): boolean {
  if (!String(p.productId || '').startsWith('p3:')) return false;
  if (/US_NUMBER/i.test(detail(p, 'PRODUCT_TYPE'))) return true;
  if (/^yes$/i.test(detail(p, 'INCLUDES_NUMBER'))) return true;
  const voice = detail(p, 'VOICE');
  return !!voice && !/^(0|no|none|n\/a|data\s*only|no\s*calls?)$/i.test(voice);
}

export function makeSearchUsNumbersHandler(cfg: Config) {
  return async (args: { max_price_usd?: number }) => {
    const raw = await callBackend<{ products?: RetailProduct[] }>(cfg, {
      method: 'GET',
      path: '/mm/products?country=US',
    });
    const plans = (raw?.products || [])
      .filter(isUsNumber)
      .map((p) => ({
        plan_id: p.productId,
        carrier: detail(p, 'PLAN_NETWORK', 'NETWORKS') || 'US carrier',
        title: detail(p, 'PLAN_TITLE') || 'US phone number',
        data_gb: parseDataGb(p),
        duration_days: parseDurationDays(p),
        price: Number(p.retailPrice || 0),
        currency: 'USD' as const,
        voice: detail(p, 'VOICE') || 'see plan',
        sms: detail(p, 'SMS') || 'see plan',
        includes_us_number: true,
      }))
      .filter((p) => p.price >= 0.5)
      .filter((p) => args.max_price_usd == null || p.price <= args.max_price_usd)
      .sort((a, b) => a.price - b.price);

    const result = { plans, meta: { total_results: plans.length, returned_at: new Date().toISOString(), source: 'meisimusa' as const } };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
  };
}
