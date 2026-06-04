// Shared mapping for MeiSIM's PUBLIC retail catalog (/mm/products). Used by
// search_plans, get_quote, and get_activation so the plan shape is identical
// everywhere. Retail prices are USD. Field names vary across providers
// (Mobimatter / SIMply / etc.), so every read uses documented fallbacks.

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

export function parseDataGb(p: RetailProduct): number | null {
  const raw = detail(p, 'PLAN_DATA_LIMIT', 'DATA', 'PLAN_DATA_QUOTA', 'PLAN_DATA', 'DATA_LIMIT');
  if (!raw) return 0;
  if (/unlimited|^ul$|\bUL_/i.test(raw)) return null;
  const m = raw.match(/([\d.]+)\s*(gb|mb)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1] ?? '0');
  if (!Number.isFinite(n)) return 0;
  const unit = (m[2] || 'gb').toLowerCase();
  return unit === 'mb' ? Math.round((n / 1024) * 100) / 100 : n;
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
    notes: [dataGb === null ? 'Unlimited data' : null, title || null].filter(Boolean).join(' · ') || undefined,
  };
}
