// Tool 1: search_plans — find travel eSIM plans for a country.
// Wraps the PUBLIC retail catalog GET /mm/products?country=XX (USD prices,
// productId as plan_id). No API key required.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { normalizePlan, type NormalizedPlan, type RetailProduct } from '../retail.js';

export const SEARCH_PLANS_NAME = 'search_plans';

export const searchPlansDescription =
  'Search travel eSIM data plans for a destination country. Returns plans with data allowance, ' +
  'validity in days, and USD price. Use this first when a user wants mobile data for a trip ' +
  '(e.g. "5GB in Italy for 10 days"). Returns a plan_id to pass to get_quote / purchase.';

export const searchPlansInput = {
  country_code: z
    .string()
    .length(2)
    .regex(/^[A-Za-z]{2}$/, 'ISO 3166-1 alpha-2, e.g. "IT", "JP"')
    .describe('Destination country as an ISO 3166-1 alpha-2 code, e.g. "IT" for Italy.'),
  duration_days: z
    .number()
    .int()
    .positive()
    .describe('Days of coverage needed. Plans shorter than this are filtered out.'),
  data_gb: z
    .number()
    .positive()
    .optional()
    .describe('Minimum data in GB. Omit to return all sizes (unlimited plans always pass).'),
  sort_by: z
    .enum(['price', 'data_per_dollar', 'duration'])
    .default('price')
    .describe('Result ordering. "price" = cheapest first (default).'),
};

const schema = z.object(searchPlansInput);
export type SearchPlansArgs = z.infer<typeof schema>;

function sortPlans(plans: NormalizedPlan[], by: SearchPlansArgs['sort_by']): NormalizedPlan[] {
  const copy = [...plans];
  if (by === 'price') copy.sort((a, b) => a.price - b.price);
  else if (by === 'duration') copy.sort((a, b) => a.duration_days - b.duration_days);
  else if (by === 'data_per_dollar') {
    const score = (p: NormalizedPlan) =>
      p.data_gb == null ? Number.POSITIVE_INFINITY : p.price > 0 ? p.data_gb / p.price : 0;
    copy.sort((a, b) => score(b) - score(a));
  }
  return copy;
}

export function makeSearchPlansHandler(cfg: Config) {
  return async (args: SearchPlansArgs) => {
    const iso = args.country_code.toUpperCase();
    const raw = await callBackend<{ products?: RetailProduct[] }>(cfg, {
      method: 'GET',
      path: `/mm/products?country=${encodeURIComponent(iso)}`,
    });

    let plans = (raw?.products || [])
      .map(normalizePlan)
      .filter((p): p is NormalizedPlan => p !== null)
      // Defense in depth: never surface sub-$0.50 test/junk plans even if the
      // backend filter missed one.
      .filter((p) => p.price >= 0.5)
      .filter((p) => p.duration_days === 0 || p.duration_days >= args.duration_days)
      .filter((p) => args.data_gb == null || p.data_gb == null || p.data_gb >= args.data_gb);

    plans = sortPlans(plans, args.sort_by);

    const result = {
      plans,
      meta: { total_results: plans.length, returned_at: new Date().toISOString(), source: 'meisimusa' as const },
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  };
}
