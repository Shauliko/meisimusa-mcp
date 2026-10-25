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
import { makeGetAiLineOfferHandler } from '../src/tools/get_ai_line_offer.js';
import { DIRECTORY_INSTRUCTIONS } from '../src/server.js';

const cfg: Config = {
  baseUrl: 'https://meisimusa-backend.vercel.app', apiKey: 'should-be-ignored', priceCurrency: 'USD', mock: true,
  timeoutMs: 5000, version: VERSION, infoOnly: false, directory: true, siteUrl: 'https://www.meisimusa.com',
};
const sc = (r: { structuredContent?: unknown }) => r.structuredContent as any;
const tools = (c: Config) => (buildServer(c) as any)._registeredTools as Record<string, any>;

describe('directory tool set', () => {
  it('registers the four public tools, the AI-line offer first', () => {
    expect(Object.keys(tools(cfg))).toEqual(['get_ai_line_offer', 'search_us_numbers', 'search_plans', 'get_quote']);
  });
  it('server instructions lead with AI phone lines, then travel', () => {
    expect(DIRECTORY_INSTRUCTIONS.indexOf('phone lines for AI agents')).toBeGreaterThanOrEqual(0);
    expect(DIRECTORY_INSTRUCTIONS.indexOf('phone lines for AI agents')).toBeLessThan(DIRECTORY_INSTRUCTIONS.search(/travel eSIM/i));
    expect(DIRECTORY_INSTRUCTIONS).toMatch(/voice agents, phone assistants, companion apps and SMS customer service/);
    expect(DIRECTORY_INSTRUCTIONS).toMatch(/cannot open an account, buy/);
  });
  it('no verification-code or VoIP-check pitch anywhere on this path', () => {
    const texts = [DIRECTORY_INSTRUCTIONS, ...Object.values(tools(cfg)).map((t: any) => String(t.description) + ' ' + String(t.title))];
    for (const x of texts) {
      expect(x).not.toMatch(/verification|OTP|2FA|VoIP (check|detection)|passes? .*checks/i);
      expect(x).not.toMatch(/Teltik|Brite|PrepaidIQ|FORT|Altaworx/);
    }
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
      expect(t.annotations?.title, name).toBe(t.title);
    }
  });
  it('tool text sends buyers to the link, never to a purchase tool', () => {
    for (const [name, t] of Object.entries(tools(cfg))) {
      expect(t.description, name).toMatch(/buy_url|links to apply/);
      expect(t.description, name).toMatch(/cannot buy|cannot open an account/);
      // the listing text describes the tool only: no other tool's name, no steering
      for (const other of Object.keys(tools(cfg))) if (other !== name) expect(t.description, name).not.toContain(other);
      expect(t.description, name).not.toMatch(/\binstead\b|use this first|start with/i);
      // the full build's phrasing points at the purchase tool; the directory text must not
      expect(t.description, name).not.toMatch(/get_quote \/ purchase|for purchase|before purchase|purchase tool/i);
    }
  });
  it('directory wins over the full set even when a key is configured', () => {
    expect(Object.keys(tools({ ...cfg, apiKey: 'k', infoOnly: false })).length).toBe(4);
  });
  it('get_ai_line_offer is absent from /mcp and /mcp-info', () => {
    expect(Object.keys(tools({ ...cfg, directory: false, apiKey: undefined }))).not.toContain('get_ai_line_offer');
    expect(Object.keys(tools({ ...cfg, directory: false, infoOnly: true, apiKey: undefined }))).not.toContain('get_ai_line_offer');
  });
});

describe('get_ai_line_offer', () => {
  it('returns the offer read from the backend, every field declared in the schema', async () => {
    const r = sc(await makeGetAiLineOfferHandler(cfg)({}));
    expect(r.monthly.texts_usd).toBe(35);
    expect(r.monthly.voice_usd).toBe(45);
    expect(r.usage_billed_separately).toBe(false);
    expect(r.monthly.note).toMatch(/all inclusive/);
    expect(r.min_months).toBe(2);
    expect(r.includes.join(' ')).toMatch(/national carrier/);
    expect(r.includes.join(' ')).toMatch(/webhook/);
    expect(r.includes.join(' ')).toMatch(/SIP/);
    expect(r.includes.join(' ')).toMatch(/One call at a time/);
    expect(r.includes.join(' ')).toMatch(/Outbound calls to US numbers only/);
    expect(r.delivery.from_stock).toBe('seconds');
    expect(r.payment_methods.length).toBeGreaterThan(0);
    expect(r.ready_now).toEqual({ texts: 12, voice: 3 });
    expect(r.apply_url).toBe('https://www.meisimusa.com/api-for-ai-agents.html');
    expect(r.docs_url).toBe('https://www.meisimusa.com/api-docs.html');
    const strict = (tools(cfg)['get_ai_line_offer'].outputSchema as any).strict();
    expect(strict.safeParse(r).success, JSON.stringify(strict.safeParse(r))).toBe(true);
  });
  it('carries no key and no customer data', async () => {
    const r = sc(await makeGetAiLineOfferHandler(cfg)({}));
    expect(JSON.stringify(r)).not.toMatch(/balance_usd|wallet|@|api_key|should-be-ignored/i);
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
    expect(r.plan.currency).toBeUndefined();
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

const IT = { country_code: 'IT', duration_days: 5, sort_by: 'price' as const };
const strictOut = (name: string, c: Config = cfg) => {
  const o = tools(c)[name].outputSchema as any;
  const deep = (z: any): any => {
    if (z?._def?.typeName === 'ZodObject') { const sh: any = {}; for (const [k, v] of Object.entries(z.shape)) sh[k] = deep(v); return z.constructor.create(sh).strict(); }
    if (z?._def?.typeName === 'ZodArray') return z.constructor.create(deep(z.element));
    if (z?._def?.typeName === 'ZodOptional' || z?._def?.typeName === 'ZodNullable' || z?._def?.typeName === 'ZodDefault') return new z.constructor({ ...z._def, innerType: deep(z._def.innerType) });
    return z;
  };
  return deep(o);
};

describe('directory: frugal results', () => {
  it('search_plans: limit defaults to 10, total_results counts everything, currency once at the top', async () => {
    const r = sc(await makeSearchPlansHandler(cfg)({ ...IT }));
    expect(r.currency).toBe('USD');
    expect(r.plans.length).toBeLessThanOrEqual(10);
    expect(r.meta.total_results).toBeGreaterThanOrEqual(r.plans.length);
    const two = sc(await makeSearchPlansHandler(cfg)({ ...IT, limit: 2 }));
    expect(two.plans.length).toBe(2);
    expect(two.meta.total_results).toBe(r.meta.total_results);
    for (const p of r.plans) {
      expect(p.country).toBeUndefined();
      expect(p.country_name).toBeUndefined();
      expect(p.currency).toBeUndefined();
      if (p.network_carriers) expect(p.network_carriers.length).toBeGreaterThan(0);
    }
    expect(strictOut('search_plans').safeParse(r).success, JSON.stringify(strictOut('search_plans').safeParse(r))).toBe(true);
  });
  it('search_plans: the text block is compact JSON, not pretty-printed', async () => {
    const res: any = await makeSearchPlansHandler(cfg)({ ...IT });
    expect(res.content[0].text).not.toMatch(/\n  /);
    expect(JSON.parse(res.content[0].text)).toEqual(res.structuredContent);
  });
  it('search_us_numbers: limit, currency once, strict schema', async () => {
    const r = sc(await makeSearchUsNumbersHandler(cfg)({ limit: 2 }));
    expect(r.currency).toBe('USD');
    expect(r.plans.length).toBe(2);
    expect(r.meta.total_results).toBeGreaterThan(2);
    for (const p of r.plans) expect(p.currency).toBeUndefined();
    const all = sc(await makeSearchUsNumbersHandler(cfg)({}));
    expect(strictOut('search_us_numbers').safeParse(all).success, JSON.stringify(strictOut('search_us_numbers').safeParse(all))).toBe(true);
  });
  it('/mcp keeps the old shape: currency per plan, vendor, no limit', async () => {
    const plain = { ...cfg, directory: false, apiKey: undefined };
    const r = sc(await makeSearchPlansHandler(plain)({ ...IT }));
    expect(r.currency).toBeUndefined();
    for (const p of r.plans) { expect(p.currency).toBe('USD'); expect(p.country).toBe('IT'); expect(typeof p.vendor).toBe('string'); }
    const us = sc(await makeSearchUsNumbersHandler(plain)({}));
    for (const p of us.plans) expect(p.currency).toBe('USD');
    expect(Object.keys(tools(plain)['search_plans'].inputSchema)).not.toContain('limit');
    expect(Object.keys(tools(plain)['get_quote'].inputSchema)).not.toContain('country_code');
  });
});

describe('directory: numbers that match reality', () => {
  it('US plans: data from the title when the detail says "See plan", 1,000 MB per GB, null when unknown', async () => {
    const r = sc(await makeSearchUsNumbersHandler(cfg)({ limit: 50 }));
    const by = (id: string) => r.plans.find((p: any) => p.plan_id === id);
    expect(by('p3:445:771').data_gb).toBe(1);
    expect(by('p3:445:747').data_gb).toBe(0.5);
    expect(by('p3:8:796').data_gb).toBe(5);
    expect(by('p3:445:799').data_gb).toBeNull();
    for (const p of r.plans) expect(p.data_gb).not.toBe(0);
  });
  it('US plans: "100 SMS Only" is 100 texts and no voice; "0" with nothing in the title is null', async () => {
    const r = sc(await makeSearchUsNumbersHandler(cfg)({ limit: 50 }));
    const by = (id: string) => r.plans.find((p: any) => p.plan_id === id);
    expect(by('p3:445:799').sms).toBe('100');
    expect(by('p3:445:799').voice).toBe('None');
    expect(by('p3:8:796').voice).toBeNull();
    expect(by('p3:8:796').sms).toBeNull();
    expect(by('p3:445:771').voice).toBe('Unlimited');
    for (const p of r.plans) { expect(p.sms).not.toBe('0'); expect(p.voice).not.toBe('0'); }
  });
  it('p2 plans: 10,000 MB is 10 GB and "1.95 GB" on a 2GB plan is 2 GB, in data_gb and in notes', async () => {
    const r = sc(await makeSearchPlansHandler(cfg)({ ...IT, limit: 50 }));
    const by = (id: string) => r.plans.find((p: any) => p.plan_id === id);
    expect(by('p2:SIMplyg_10GB_30D_IT_V2').data_gb).toBe(10);
    expect(by('p2:SIMplyg_10GB_30D_IT_V2').notes).toBe('10 GB · 30 days · Italy');
    expect(by('p2:SIMplyg_2GB_15D_IT_V2').data_gb).toBe(2);
    expect(by('p2:SIMplyg_2GB_15D_IT_V2').notes).toBe('2 GB · 15 days · Italy');
    for (const p of r.plans) expect(p.data_gb).not.toBe(0);
  });
});

describe('directory: get_quote on a regional plan', () => {
  const REGIONAL = 'c7105b7e-6519-4e4e-b5da-141f2e5e5e30';
  it('without country_code: coverage fields, no country fields, no network as a country name', async () => {
    const r = sc(await makeGetQuoteHandler(cfg)({ plan_id: REGIONAL }));
    expect(r.plan.coverage).toBe('regional');
    expect(r.plan.coverage_countries).toBe(36);
    expect(r.plan.country).toBeUndefined();
    expect(r.plan.country_name).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('Sparks');
    expect(r.buy_url).toBe(buyUrl(cfg, REGIONAL));
    expect(r.total.currency).toBe('USD');
    expect(strictOut('get_quote').safeParse(r).success, JSON.stringify(strictOut('get_quote').safeParse(r))).toBe(true);
  });
  it('with country_code IT: labelled Italy and the buy page opens for Italy', async () => {
    const r = sc(await makeGetQuoteHandler(cfg)({ plan_id: REGIONAL, country_code: 'it' }));
    expect(r.plan.country).toBe('IT');
    expect(r.plan.country_name).toBe('Italy');
    expect(r.plan.coverage).toBe('regional');
    expect(r.buy_url).toBe(buyUrl(cfg, REGIONAL, { country: 'IT' }));
    expect(r.plan.buy_url).toBe(r.buy_url);
    expect(strictOut('get_quote').safeParse(r).success).toBe(true);
  });
  it('with a country the plan does not cover: a tool error, not a wrong label', async () => {
    const g = (buildServer(cfg) as any)._registeredTools['get_quote'];
    const fn = g.handler || g.callback;
    const res = await fn({ plan_id: REGIONAL, country_code: 'US' }, {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/invalid_input/);
  });
  it('a one-country plan keeps its own country', async () => {
    const r = sc(await makeGetQuoteHandler(cfg)({ plan_id: 'mm_IT_1gb_7d' }));
    expect(r.plan.country).toBe('IT');
    expect(r.plan.country_name).toBe('Italy');
    expect(r.plan.coverage).toBe('country');
  });
  it('/mcp get_quote is unchanged: the plain plan with currency, no coverage fields', async () => {
    const r = sc(await makeGetQuoteHandler({ ...cfg, directory: false, apiKey: undefined })({ plan_id: REGIONAL }));
    expect(r.plan.currency).toBe('USD');
    expect(r.plan.coverage).toBeUndefined();
    expect(r.buy_url).toBeUndefined();
  });
});
