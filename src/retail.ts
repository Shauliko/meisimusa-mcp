// Shared mapping for MeiSIM's PUBLIC retail catalog (/mm/products). Used by
// search_plans, get_quote, and get_activation so the plan shape is identical
// everywhere. Retail prices are USD. Field names vary across providers
// (Mobimatter / SIMply / etc.), so every read uses documented fallbacks.

import type { Config } from './config.js';

/**
 * Where a person buys one exact plan on the website. plans.html opens the buy
 * modal for `?buy=<productId>` once the catalog loads; `country=` preselects the
 * search box for travel plans and `#us` opens the US-numbers tab. Used by the
 * directory build, which never sells in-chat.
 */
export function buyUrl(cfg: Config, planId: string, opts: { country?: string; us?: boolean } = {}): string {
  const site = (cfg.siteUrl || 'https://www.meisimusa.com').replace(/\/$/, '');
  const q = new URLSearchParams();
  if (opts.country && !opts.us) q.set('country', opts.country.toUpperCase());
  q.set('buy', planId);
  return `${site}/plans.html?${q.toString()}${opts.us ? '#us' : ''}`;
}

export const HOW_TO_BUY =
  'This connector only reads the public catalog. To buy, open the buy_url of the plan you want: ' +
  'it opens that exact plan on meisimusa.com, where you pay by card and the eSIM is emailed to you.';

export interface RetailProduct {
  productId: string;
  providerName?: string;
  retailPrice?: number | string;
  productCategory?: string;
  countries?: string[];
  regions?: string[];
  productDetails?: { name?: string; value?: string }[];
}

export interface NormalizedPlan {
  plan_id: string;
  country: string;
  country_name: string;
  data_gb: number | null; // null = unlimited
  duration_days: number;
  price: number;
  currency: 'USD';
  network_carriers: string[];
  unlimited_voice?: boolean;
  notes?: string;
}

export function detail(p: RetailProduct, ...names: string[]): string {
  const dets = p.productDetails || [];
  for (const n of names) {
    const hit = dets.find((d) => (d.name || '').toUpperCase() === n.toUpperCase());
    if (hit && hit.value) return String(hit.value);
  }
  return '';
}

// Data allowance in GB. 1,000 MB = 1 GB (the catalog's "9.77 GB" for a 10 GB
// plan came from dividing by 1024). A detail that is not a number ("See plan")
// falls back to the plan title ("Talk, Text & 1GB", "500 MBs"); a p2 plan id
// names its size ("_2GB_") and wins over a rounded detail ("1.95 GB").
// Returns null when the plan is unlimited OR the size is unknown: never 0.
const DATA_TOKEN = /(\d+(?:\.\d+)?)\s*(gb|mbs?)\b/i;
function gbFromToken(m: RegExpMatchArray | null): number | null {
  if (!m) return null;
  const n = parseFloat(m[1] ?? '');
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || 'gb').toLowerCase();
  return unit.startsWith('mb') ? Math.round((n / 1000) * 100) / 100 : n;
}
export function parseDataGb(p: RetailProduct): number | null {
  const raw = detail(p, 'PLAN_DATA_LIMIT', 'DATA', 'PLAN_DATA_QUOTA', 'PLAN_DATA', 'DATA_LIMIT');
  const title = detail(p, 'PLAN_TITLE', 'TITLE');
  if (/unlimited|^ul$|\bUL_/i.test(raw) || (!raw.trim() && /unlimited/i.test(title))) return null;
  // A bare number in the detail is GB unless PLAN_DATA_UNIT says otherwise.
  let gb: number | null = null;
  const bare = raw.trim().match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const n = parseFloat(bare[1] ?? '');
    gb = /^mb/i.test(detail(p, 'PLAN_DATA_UNIT')) ? Math.round((n / 1000) * 100) / 100 : n;
  } else {
    gb = gbFromToken(raw.match(DATA_TOKEN));
  }
  if (gb == null) gb = gbFromToken(title.match(DATA_TOKEN));
  const idGb = String(p.productId || '').match(/_(\d+)GB_/i);
  if (idGb && gb != null) {
    const n = Number(idGb[1]);
    if (n > 0 && Math.abs(gb - n) / n <= 0.05) gb = n;
  }
  return gb;
}

// Number of countries a plan covers. The backend's `countries` array mixes ISO
// codes with full names (e.g. ["IT","Italy"]), so we count the ISO entries; if
// none are present we fall back to the raw list length.
export function coverageCount(p: RetailProduct): number {
  const list = p.countries || [];
  const isoCount = list.filter((c) => /^[A-Za-z]{2}$/.test(String(c))).length;
  return isoCount || list.length;
}
export function coverageOf(p: RetailProduct): 'country' | 'regional' {
  return coverageCount(p) <= 3 ? 'country' : 'regional';
}
/** True when the plan's country list names this ISO code (lists without ISO codes cannot say). */
export function coversIso(p: RetailProduct, iso: string): boolean | null {
  const list = (p.countries || []).map((c) => String(c));
  if (!list.some((c) => /^[A-Za-z]{2}$/.test(c))) return null;
  return list.some((c) => c.toUpperCase() === iso.toUpperCase());
}

// English country name from an ISO code via the built-in Intl API (Node 18+,
// no dependency). Falls back to the raw code if the lookup fails.
export function isoToCountryName(iso: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso) || iso;
  } catch {
    return iso;
  }
}

export function parseDurationDays(p: RetailProduct): number {
  // 1) trust a sane day-count
  const vid = Number(detail(p, 'VALIDITY_IN_DAYS', 'PLAN_VALIDITY_DAYS'));
  if (Number.isFinite(vid) && vid >= 1 && vid <= 400) return vid;
  // 2) "N day(s)" from the title (authoritative when present)
  const tm = detail(p, 'PLAN_TITLE', 'TITLE').match(/(\d+)\s*day/i);
  if (tm && tm[1]) return Number(tm[1]);
  // 3) PLAN_VALIDITY is in HOURS for several vendors (e.g. 240 = 10 days) →
  //    convert when it's a clean multiple of 24 or clearly too big to be days.
  const pv = Number((detail(p, 'PLAN_VALIDITY', 'VALIDITY', 'DURATION').match(/[\d.]+/) || ['0'])[0]);
  if (Number.isFinite(pv) && pv > 0) return pv > 366 || pv % 24 === 0 ? Math.round(pv / 24) : Math.round(pv);
  return 0;
}

function pickCountry(p: RetailProduct): { iso: string; name: string } {
  const list = p.countries || [];
  const iso = list.find((c) => /^[A-Za-z]{2}$/.test(String(c))) || '';
  const name = list.find((c) => !/^[A-Za-z]{2}$/.test(String(c))) || '';
  return { iso: iso.toUpperCase(), name };
}

export function normalizePlan(p: RetailProduct): NormalizedPlan | null {
  if (!p || !p.productId) return null;
  const { iso, name } = pickCountry(p);
  const dataGb = parseDataGb(p);
  const voiceRaw = detail(p, 'VOICE', 'PLAN_VOICE', 'MINUTES');
  const carriersRaw = detail(p, 'NETWORKS', 'NETWORK', 'CARRIERS');
  const title = detail(p, 'PLAN_TITLE', 'TITLE', 'PLAN_FAMILY_NAME');
  const unlimited = /unlimited|^ul$|\bUL_/i.test(detail(p, 'PLAN_DATA_LIMIT', 'DATA', 'PLAN_DATA_QUOTA', 'PLAN_DATA', 'DATA_LIMIT'));
  // A title that opens with the raw size ("1000 MB · 7 days", "1.95 GB · 15 days")
  // is restated with the normalized size, so notes and data_gb agree.
  const noteTitle = dataGb != null ? title.replace(/^\d+(?:\.\d+)?\s*(?:GB|MBs?)\b/i, `${dataGb} GB`) : title;

  return {
    plan_id: p.productId,
    country: iso,
    country_name: name || p.providerName || '',
    data_gb: dataGb,
    duration_days: parseDurationDays(p),
    price: Number(p.retailPrice || 0),
    currency: 'USD',
    network_carriers: carriersRaw ? carriersRaw.split(/[,/]/).map((s) => s.trim()).filter(Boolean) : [],
    unlimited_voice: /unlimited/i.test(voiceRaw),
    notes: [unlimited ? 'Unlimited data' : null, noteTitle || null].filter(Boolean).join(' · ') || undefined,
  };
}
