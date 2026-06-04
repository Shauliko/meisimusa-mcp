import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Config } from '../src/config.js';
import { VERSION } from '../src/config.js';
import { makeSearchPlansHandler } from '../src/tools/search_plans.js';

const baseCfg: Config = {
  baseUrl: 'https://meisimusa-backend.vercel.app',
  apiKey: undefined,
  priceCurrency: 'USD',
  mock: false,
  timeoutMs: 5000,
  version: VERSION,
};

const sc = (r: { structuredContent?: unknown }) =>
  r.structuredContent as { plans: any[]; meta: { total_results: number; source: string } };

afterEach(() => vi.restoreAllMocks());

describe('search_plans (retail path)', () => {
  it('happy path (mock): Italy plans, cheapest first, trip-length filtered, USD', async () => {
    const res = await makeSearchPlansHandler({ ...baseCfg, mock: true })({
      country_code: 'IT', duration_days: 10, sort_by: 'price',
    });
    const { plans, meta } = sc(res);
    expect(meta.source).toBe('meisimusa');
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((p) => p.duration_days === 0 || p.duration_days >= 10)).toBe(true); // 7d filtered out
    const prices = plans.map((p) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(plans[0]).toMatchObject({ country: 'IT', currency: 'USD' });
  });

  it('applies the data_gb minimum filter', async () => {
    const res = await makeSearchPlansHandler({ ...baseCfg, mock: true })({
      country_code: 'IT', duration_days: 5, data_gb: 8, sort_by: 'price',
    });
    expect(sc(res).plans.every((p) => p.data_gb == null || p.data_gb >= 8)).toBe(true);
  });

  it('429 surfaces retry_after_seconds and does not retry', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429, headers: { 'retry-after': '30' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(makeSearchPlansHandler(baseCfg)({ country_code: 'IT', duration_days: 10, sort_by: 'price' }))
      .rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 30 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('unsupported-but-valid country returns empty, not an error', async () => {
    const res = await makeSearchPlansHandler({ ...baseCfg, mock: true })({
      country_code: 'ZZ', duration_days: 5, sort_by: 'price',
    });
    expect(sc(res).meta.total_results).toBe(0);
  });
});
