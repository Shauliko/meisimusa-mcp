// Tool 2: get_quote — confirm the price for a plan before buying.
// Wraps GET /mm/products/:productId (public, USD). With the retail catalog
// there IS a lookup-by-id, so this matches the spec's plan_id-only input.
// Retail prices have no separate tax/fee line, so those are 0 and final ==
// subtotal. The quote_expires_at is an advisory client-side TTL.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { ToolError } from '../errors.js';
import { normalizePlan, buyUrl, coverageCount, coversIso, isoToCountryName, HOW_TO_BUY, type RetailProduct } from '../retail.js';

export const GET_QUOTE_NAME = 'get_quote';

export const getQuoteDescription =
  'Confirm the current USD price for a specific eSIM plan before purchasing. Returns the full plan ' +
  'plus a price breakdown and a short-lived quote. Call after search_plans, before purchase.';

// Directory build: the exact listing text. What it returns and who it is for; nothing about other tools.
export const getQuoteDirectoryDescription =
  'The current USD price of one travel eSIM or retail US phone plan, by the plan_id from a plan search: the plan, ' +
  'a price breakdown (subtotal, taxes, fees, total), when the quote expires, and the buy_url that opens that plan ' +
  'on meisimusa.com. Not for phone lines for AI agents. Read-only: it cannot buy anything.';

export const getQuoteInput = {
  plan_id: z.string().describe('The plan_id (productId) returned by search_plans.'),
};

// Directory build: a regional plan ("Europe 5 GB") covers many countries, so the
// caller may say which destination it is for; that labels the plan and opens the
// buy page for that country. /mcp and /mcp-info keep the plan_id-only input.
export const getQuoteDirectoryInput = {
  plan_id: z.string().describe('The plan_id of a travel eSIM or US phone plan, as returned by a plan search.'),
  country_code: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'ISO 3166-1 alpha-2, e.g. "IT"')
    .optional()
    .describe('Optional destination country, ISO 3166-1 alpha-2 (e.g. "IT"), used to label a regional plan and open its buy page for that country.'),
};

const QUOTE_TTL_MINUTES = 15;

export function makeGetQuoteHandler(cfg: Config) {
  return async (args: { plan_id: string; country_code?: string }) => {
    const raw = await callBackend<{ product?: RetailProduct }>(cfg, {
      method: 'GET',
      path: `/mm/products/${encodeURIComponent(args.plan_id)}`,
    });

    const plan = raw?.product ? normalizePlan(raw.product) : null;
    if (!plan || !raw?.product) {
      throw new ToolError('not_found', `Plan "${args.plan_id}" not found. Re-run search_plans.`, { status: 404 });
    }

    const price = plan.price;

    if (!cfg.directory) {
      const result = {
        plan,
        total: { subtotal: price, taxes: 0, fees: 0, final: price, currency: plan.currency },
        quote_expires_at: new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000).toISOString(),
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }

    // ── Directory build ──
    // country/country_name only ever hold a country: the destination the caller
    // named, or the plan's own country when it covers one country. A regional
    // plan without a destination gets coverage fields instead (as search_plans).
    const rp = raw.product;
    const isUs = String(plan.plan_id).startsWith('p3:');
    const n = coverageCount(rp);
    const coverage = n <= 3 ? ('country' as const) : ('regional' as const);
    const iso = args.country_code ? args.country_code.toUpperCase() : undefined;
    if (iso && coversIso(rp, iso) === false) {
      throw new ToolError('invalid_input', `Plan "${args.plan_id}" does not cover ${iso}. Search plans for ${iso} to find one that does.`, { status: 400 });
    }
    const { country: ownIso, country_name: ownName, currency: _cur, network_carriers, ...rest } = plan;
    const ownIsCountry = coverage === 'country' && /^[A-Z]{2}$/.test(ownIso) && !!ownName && !/^[A-Z]{2}$/.test(ownName);
    const labelled = iso
      ? { country: iso, country_name: isoToCountryName(iso) }
      : ownIsCountry
        ? { country: ownIso, country_name: ownName }
        : {};
    const link = buyUrl(cfg, plan.plan_id, { us: isUs, country: !isUs ? iso : undefined });
    const planOut = {
      ...rest,
      ...labelled,
      ...(network_carriers.length ? { network_carriers } : {}),
      coverage,
      coverage_countries: n,
      buy_url: link,
    };
    const result = {
      plan: planOut,
      total: { subtotal: price, taxes: 0, fees: 0, final: price, currency: 'USD' as const },
      quote_expires_at: new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000).toISOString(),
      buy_url: link,
      how_to_buy: HOW_TO_BUY,
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
  };
}
