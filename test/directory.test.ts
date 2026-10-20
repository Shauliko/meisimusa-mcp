// The Claude Connectors Directory build (/mcp-directory): three public,
// read-only catalog tools, every plan with a buy_url on meisimusa.com, nothing
// that moves money, reads a key, or touches an account.
import { describe, it, expect } from 'vitest';
import type { Config } from '../src/config.js';
import { VERSION } from '../src/config.js';
import { buildServer } from '../src/server.js';
import { buyUrl } from '../src/retail.js';
import { makeSearchPlansHandler } from '../src/tools/search_plans.js';
import { makeSearchUsNumbersHandler } from '../src/tools/search_us_numbers.js';
import { makeGetQuoteHandler } from '../src/tools/get_quote.js';

const cfg: Config = {
  baseUrl: 'https://meisimusa-backend.vercel.app', apiKey: 'should-be-ignored', priceCurrency: 'USD', mock: true,
  timeoutMs: 5000, version: VERSION, infoOnly: false, directory: true, siteUrl: 'https://www.meisimusa.com',
};
const sc = (r: { structuredContent?: unknown }) => r.structuredContent as any;
const tools = (c: Config) => (buildServer(c) as any)._registeredTools as Record<string, any>;

describe('directory tool set', () => {
  it('registers exactly the three catalog tools', () => {
    expect(Object.keys(tools(cfg)).sort()).toEqual(['get_quote', 'search_plans', 'search_us_numbers']);
  });
  it('nothing that buys, tops up, messages or reads an account', () => {
    const names = Object.keys(tools(cfg));
    for (const n of ['purchase', 'get_activation', 'topup_lookup', 'topup_start', 'get_account', 'get_number_pricing',
      'buy_numbers', 'get_order', 'list_my_numbers', 'read_messages', 'wait_for_message', 'send_message']) {
      expect(names).not.toContain(n);
    }
  });
  it('every tool has a title and is annotated read-only, not destructive', () => {
    for (const [name, t] of Object.entries(tools(cfg))) {
      expect(t.title, name).toBeTruthy();
      expect(t.annotations?.readOnlyHint, name).toBe(true);
      expect(t.annotations?.destructiveHint, name).toBe(false);
    }
  });
  it('tool text sends buyers to the link, never to a purchase tool', () => {
    for (const [name, t] of Object.entries(tools(cfg))) {
      expect(t.description, name).toMatch(/buy_url/);
      expect(t.description, name).toMatch(/cannot buy/);
      // the full build's phrasing points at the purchase tool; the directory text must not
      expect(t.description, name).not.toMatch(/get_quote \/ purchase|for purchase|before purchase|purchase tool/i);
    }
  });
  it('directory wins over the full set even when a key is configured', () => {
    expect(Object.keys(tools({ ...cfg, apiKey: 'k', infoOnly: false })).length).toBe(3);
  });
});

describe('buy links', () => {
  it('travel plan: plans.html with the country and the exact plan', () => {
    expect(buyUrl(cfg, 'ABC-123', { country: 'it' })).toBe('https://www.meisimusa.com/plans.html?country=IT&buy=ABC-123');
  });
  it('US number: the US tab, plan id URL-encoded', () => {
    expect(buyUrl(cfg, 'p3:1:100', { us: true })).toBe('https://www.meisimusa.com/plans.html?buy=p3%3A1%3A100#us');
  });
  it('search_plans: every plan carries buy_url and the result says how to buy', async () => {
    const r = sc(await makeSearchPlansHandler(cfg)({ country_code: 'IT', duration_days: 5, sort_by: 'price' }));
    expect(r.plans.length).toBeGreaterThan(0);
    for (const p of r.plans) expect(p.buy_url).toBe(buyUrl(cfg, p.plan_id, { country: 'IT' }));
    expect(r.how_to_buy).toMatch(/meisimusa\.com/);
  });
  it('search_plans: no supplier name on the directory build, coverage fields kept', async () => {
    const r = sc(await makeSearchPlansHandler(cfg)({ country_code: 'IT', duration_days: 5, sort_by: 'price' }));
    for (const p of r.plans) {
      expect(p.vendor).toBeUndefined();
      expect(['country', 'regional']).toContain(p.coverage);
      expect(Number.isInteger(p.coverage_countries)).toBe(true);
    }
    const full = sc(await makeSearchPlansHandler({ ...cfg, directory: false, apiKey: undefined })({ country_code: 'IT', duration_days: 5, sort_by: 'price' }));
    expect(full.plans.some((p: any) => typeof p.vendor === 'string')).toBe(true);
  });
  it('every plan field search_plans returns is declared in the output schema (strict clients)', async () => {
    for (const c of [cfg, { ...cfg, directory: false, apiKey: undefined }]) {
      const schema = tools(c)['search_plans'].outputSchema as any;
      const item = schema.shape.plans.element.strict();
      const r = sc(await makeSearchPlansHandler(c)({ country_code: 'IT', duration_days: 5, sort_by: 'price' }));
      for (const p of r.plans) expect(item.safeParse(p).success, JSON.stringify(p)).toBe(true);
    }
  });
  it('search_us_numbers: every plan carries buy_url on the US tab', async () => {
    const r = sc(await makeSearchUsNumbersHandler(cfg)({}));
    expect(r.plans.length).toBeGreaterThan(0);
    for (const p of r.plans) expect(p.buy_url).toBe(buyUrl(cfg, p.plan_id, { us: true }));
    expect(r.how_to_buy).toMatch(/meisimusa\.com/);
  });
  it('get_quote: buy_url on the plan and at the top level', async () => {
    const list = sc(await makeSearchPlansHandler(cfg)({ country_code: 'IT', duration_days: 5, sort_by: 'price' }));
    const r = sc(await makeGetQuoteHandler(cfg)({ plan_id: list.plans[0].plan_id }));
    expect(r.plan.buy_url).toBe(buyUrl(cfg, list.plans[0].plan_id));
    expect(r.plan.buy_url).not.toContain('country=');
    expect(r.buy_url).toBe(r.plan.buy_url);
    expect(r.total.final).toBe(r.plan.price);
    expect(r.how_to_buy).toMatch(/meisimusa\.com/);
  });
  it('outside the directory build nothing changes: no buy_url, no how_to_buy', async () => {
    const plain = { ...cfg, directory: false, apiKey: undefined };
    const r = sc(await makeSearchPlansHandler(plain)({ country_code: 'IT', duration_days: 5, sort_by: 'price' }));
    expect(r.how_to_buy).toBeUndefined();
    expect(r.plans.every((p: any) => p.buy_url === undefined)).toBe(true);
    const names = Object.keys(tools(plain));
    expect(names).toContain('purchase');
    expect(names).toContain('send_message');
  });
});
