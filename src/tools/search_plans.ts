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

// A search result is a normalized plan plus search-context fields (the country
// the user searched for, the vendor, and coverage breadth). get_quote/purchase
// keep using the bare NormalizedPlan — these extra fields live only here.
type SearchPlan = NormalizedPlan & {
  vendor: string;
  coverage: 'country' | 'regional';
  coverage_countries: number;
};

function sortPlans<T extends NormalizedPlan>(plans: T[], by: SearchPlansArgs['sort_by']): T[] {
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

// Number of countries a plan covers. The backend's `countries` array mixes ISO
// codes with full names (e.g. ["IT","Italy"]), so we count the ISO entries; if
// none are present we fall back to the raw list length.
function coverageCount(rp: RetailProduct): number {
  const list = rp.countries || [];
  const isoCount = list.filter((c) => /^[A-Za-z]{2}$/.test(String(c))).length;
  return isoCount || list.length;
}

// English country name from an ISO code via the built-in Intl API (Node 18+,
// no dependency). Falls back to the raw code if the lookup fails.
function isoToCountryName(iso: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso) || iso;
  } catch {
    return iso;
  }
}

export function makeSearchPlansHandler(cfg: Config) {
  return async (args: SearchPlansArgs) => {
    const iso = args.country_code.toUpperCase();
    const raw = await callBackend<{ products?: RetailProduct[] }>(cfg, {
      method: 'GET',
      path: `/mm/products?country=${encodeURIComponent(iso)}`,
    });

    const countryName = isoToCountryName(iso);

    // Keep each raw product alongside its normalized plan so we can read the
    // vendor + coverage breadth (lost during normalize) when building results.
    let items = (raw?.products || [])
      .map((rp) => ({ rp, plan: normalizePlan(rp) }))
      .filter((x): x is { rp: RetailProduct; plan: NormalizedPlan } => x.plan !== null)
      // Travel data only — real US phone-number plans (p3:) have their own tool.
      .filter((x) => !String(x.plan.plan_id).startsWith('p3:'))
      // Defense in depth: never surface sub-$0.50 test/junk plans.
      .filter((x) => x.plan.price >= 0.5)
      .filter((x) => x.plan.duration_days === 0 || x.plan.duration_days >= args.duration_days)
      .filter((x) => args.data_gb == null || x.plan.data_gb == null || x.plan.data_gb >= args.data_gb);

    // Build the search results. Every returned plan covers the searched country,
    // so `country`/`country_name` reflect what the user asked for — NOT the
    // plan's first alphabetical coverage country. The vendor moves to its own
    // field, and we flag whether a plan is country-specific or regional.
    let plans: SearchPlan[] = items.map(({ rp, plan }) => {
      const n = coverageCount(rp);
      return {
        ...plan,
        country: iso,
        country_name: countryName,
        vendor: rp.providerName || '',
        coverage: (n <= 3 ? 'country' : 'regional') as 'country' | 'regional',
        coverage_countries: n,
      };
    });

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
