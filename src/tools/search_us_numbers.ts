// Tool: search_us_numbers — real US phone-number plans (calls/texts/data on a
// genuine US carrier line, not a data-only travel eSIM). These are the p3:
// products inside /mm/products?country=US, flagged PRODUCT_TYPE=US_NUMBER.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { detail, parseDataGb, parseDurationDays, buyUrl, HOW_TO_BUY, type RetailProduct } from '../retail.js';

export const SEARCH_US_NUMBERS_NAME = 'search_us_numbers';

export const searchUsNumbersDescription =
  'Find real US phone-number plans (a genuine US carrier line with calls, texts, and data, no SSN or contract). ' +
  'Use this when the user wants an actual US number, not just travel data. Returns a plan_id for purchase.';

// Directory build: the exact listing text. What it returns and who it is for; nothing about other tools.
export const searchUsNumbersDirectoryDescription =
  'Retail US phone plans for a person\'s own phone: a US number with calls, texts and data on a US carrier, paid by ' +
  'card, with no SSN or contract. Returns each plan\'s carrier, monthly price, data, minutes and texts, and a buy_url ' +
  'that opens it on meisimusa.com. For a person who wants a US number on their own handset; phone lines for AI agents ' +
  'are a separate offer. Read-only: it cannot buy anything.';

export const searchUsNumbersInput = {
  max_price_usd: z.number().positive().optional().describe('Optional max monthly price in USD.'),
};

// Directory build adds a page size (policy: be frugal with tokens). /mcp and /mcp-info keep the original input.
export const searchUsNumbersDirectoryInput = {
  ...searchUsNumbersInput,
  limit: z.number().int().min(1).max(50).default(10).describe('How many plans to return, 1 to 50 (default 10). meta.total_results is the count before this limit.'),
};

function isUsNumber(p: RetailProduct): boolean {
  if (!String(p.productId || '').startsWith('p3:')) return false;
  if (/US_NUMBER/i.test(detail(p, 'PRODUCT_TYPE'))) return true;
  if (/^yes$/i.test(detail(p, 'INCLUDES_NUMBER'))) return true;
  const voice = detail(p, 'VOICE');
  return !!voice && !/^(0|no|none|n\/a|data\s*only|no\s*calls?)$/i.test(voice);
}

// The catalog's VOICE / SMS details carry "0" on plans whose title says
// otherwise ("100 SMS Only"), so "0" is read as unknown and the title is the
// second source. Unknown is null, never a number that is not true.
function allowance(p: RetailProduct, name: 'VOICE' | 'SMS'): string | null {
  const v = detail(p, name).trim();
  if (v && v !== '0') return v;
  const title = detail(p, 'PLAN_TITLE');
  if (name === 'SMS') {
    const m = title.match(/(\d+)\s*(?:SMS|texts?)\b/i);
    if (m) return m[1] ?? null;
    if (/unlimited/i.test(title) && /text/i.test(title)) return 'Unlimited';
  }
  if (name === 'VOICE') {
    if (/sms only|text only/i.test(title)) return 'None';
    if (/unlimited/i.test(title) && /talk/i.test(title)) return 'Unlimited';
  }
  return null;
}

export function makeSearchUsNumbersHandler(cfg: Config) {
  return async (args: { max_price_usd?: number; limit?: number }) => {
    const raw = await callBackend<{ products?: RetailProduct[] }>(cfg, {
      method: 'GET',
      path: '/mm/products?country=US',
    });
    const all = (raw?.products || [])
      .filter(isUsNumber)
      .map((p) => ({
        plan_id: p.productId,
        carrier: detail(p, 'PLAN_NETWORK', 'NETWORKS') || 'US carrier',
        title: detail(p, 'PLAN_TITLE') || 'US phone number',
        data_gb: parseDataGb(p),
        duration_days: parseDurationDays(p),
        price: Number(p.retailPrice || 0),
        ...(cfg.directory ? {} : { currency: 'USD' as const }),
        voice: allowance(p, 'VOICE'),
        sms: allowance(p, 'SMS'),
        includes_us_number: true,
      }))
      .filter((p) => p.price >= 0.5)
      .filter((p) => args.max_price_usd == null || p.price <= args.max_price_usd)
      .sort((a, b) => a.price - b.price);

    const plans = cfg.directory
      ? all.slice(0, args.limit ?? 10).map((p) => ({ ...p, buy_url: buyUrl(cfg, p.plan_id, { us: true }) }))
      : all;

    const meta = { total_results: all.length, returned_at: new Date().toISOString(), source: 'meisimusa' as const };
    const result = cfg.directory ? { currency: 'USD' as const, plans, meta, how_to_buy: HOW_TO_BUY } : { plans, meta };
    return {
      content: [{ type: 'text' as const, text: cfg.directory ? JSON.stringify(result) : JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  };
}
