// The tools on YOUR numbers (API key). Run against the mock, which mirrors the
// real shapes of /api/v1/sms/* and /dealer/*, plus the one rule the real
// server enforces before any network call: no key, no tool.
import { describe, it, expect } from 'vitest';
import type { Config } from '../src/config.js';
import { VERSION } from '../src/config.js';
import { ToolError } from '../src/errors.js';
import { makeGetAccountHandler } from '../src/tools/get_account.js';
import { makeGetNumberPricingHandler } from '../src/tools/get_number_pricing.js';
import { makeBuyNumbersHandler } from '../src/tools/buy_numbers.js';
import { makeGetOrderHandler } from '../src/tools/get_order.js';
import { makeListMyNumbersHandler } from '../src/tools/list_my_numbers.js';
import { makeReadMessagesHandler } from '../src/tools/read_messages.js';
import { makeWaitForMessageHandler } from '../src/tools/wait_for_message.js';
import { makeSendMessageHandler } from '../src/tools/send_message.js';
import { buildServer } from '../src/server.js';

const cfg: Config = { baseUrl: 'https://meisimusa-backend.vercel.app', apiKey: undefined, priceCurrency: 'USD', mock: true, timeoutMs: 5000, version: VERSION, infoOnly: false };
const sc = (r: { structuredContent?: unknown }) => r.structuredContent as any;

describe('no key, no tool', () => {
  it('every keyed tool refuses with unauthorized and says where to apply', async () => {
    const live = { ...cfg, mock: false };
    const handlers: Array<(a: any) => Promise<any>> = [
      makeGetAccountHandler(live), makeGetNumberPricingHandler(live), makeListMyNumbersHandler(live),
      makeReadMessagesHandler(live), makeWaitForMessageHandler(live), makeGetOrderHandler(live),
      makeSendMessageHandler(live), makeBuyNumbersHandler(live),
    ];
    for (const h of handlers) {
      const err = await h({ count: 1, billing: 'daily', from: '4234322309', to: '2125550100', message: 'x', order: 'y' }).catch((e) => e);
      expect(err).toBeInstanceOf(ToolError);
      expect(err.code).toBe('unauthorized');
      expect(err.message).toContain('wholesale.html#apply');
    }
  });
});

describe('account + pricing', () => {
  it('get_account: company, balance, daily ceiling', async () => {
    const r = sc(await makeGetAccountHandler(cfg)({}));
    expect(r).toMatchObject({ company: 'Mock Agents Inc', balance_usd: 69.25, currency: 'USD', lines_remaining_today: 18 });
  });
  it('get_number_pricing: both ways of paying, voice priced', async () => {
    const r = sc(await makeGetNumberPricingHandler(cfg)({}));
    expect(r.can_order).toBe(true);
    expect(r.monthly).toMatchObject({ first_month_usd: 25, min_months: 2, voice_price_usd: 35 });
    expect(r.daily).toMatchObject({ price_usd: 1, voice_price_usd: 1.5, min_days: 5, activation_fee_usd: 4 });
  });
});

describe('numbers + messages', () => {
  it('list_my_numbers: paged, reduced shape, no SIP secrets', async () => {
    const r = sc(await makeListMyNumbersHandler(cfg)({ limit: 1 }));
    expect(r.total).toBe(2);
    expect(r.next_offset).toBe(1);
    expect(r.numbers[0]).toMatchObject({ number: '4234322309', voice: true, billing: 'daily', paid_through: '2026-10-15' });
    for (const n of r.numbers) { expect(n).not.toHaveProperty('sip'); expect(n).not.toHaveProperty('iccid'); }
    expect(JSON.stringify(r)).not.toMatch(/password|pbx|"host"/i);
    const page2 = sc(await makeListMyNumbersHandler(cfg)({ limit: 1, offset: 1 }));
    expect(page2.numbers[0].number).toBe('2696555552');
    expect(page2.next_offset).toBeNull();
  });
  it('list_my_numbers: search by part of the number', async () => {
    const r = sc(await makeListMyNumbersHandler(cfg)({ search: '2696' }));
    expect(r.numbers.map((n: any) => n.number)).toEqual(['2696555552']);
  });
  it('read_messages: a formatted number is accepted; since filters', async () => {
    const r = sc(await makeReadMessagesHandler(cfg)({ number: '+1 (269) 655-5552' }));
    expect(r.count).toBe(1);
    expect(r.messages[0]).toMatchObject({ number: '2696555552', from: '12125550100' });
    expect(r.messages[0].text).toContain('confirmed');
    expect(r.messages[0]).not.toHaveProperty('otp');
    const later = sc(await makeReadMessagesHandler(cfg)({ number: '2696555552', since: new Date().toISOString() }));
    expect(later.count).toBe(0);
    expect(later.note).toMatch(/Nothing new/);
  });
  it('read_messages: a number that is not yours reads as empty, never as an error', async () => {
    const r = sc(await makeReadMessagesHandler(cfg)({ number: '2125550100' }));
    expect(r.count).toBe(0);
  });
  it('wait_for_message: returns the message that arrived after since', async () => {
    const r = sc(await makeWaitForMessageHandler(cfg)({ number: '2696555552', since: new Date(Date.now() - 120_000).toISOString(), timeout_seconds: 5 }));
    expect(r.received).toBe(true);
    expect(r.messages[0].number).toBe('2696555552');
  });
  it('wait_for_message: gives up at the timeout with received:false', async () => {
    const r = sc(await makeWaitForMessageHandler(cfg)({ number: '2696555552', timeout_seconds: 1 }));
    expect(r.received).toBe(false);
    expect(r.messages).toEqual([]);
    expect(r.note).toMatch(/again/);
  });
  it('send_message: from one of mine', async () => {
    const r = sc(await makeSendMessageHandler(cfg)({ from: '+1 423 432 2309', to: '+1 212 555 0100', message: 'On my way.' }));
    expect(r).toMatchObject({ sent: true, from: '4234322309', to: '12125550100' });
  });
  it('send_message: not my number is not_found', async () => {
    const err = await makeSendMessageHandler(cfg)({ from: '2125550100', to: '2125550101', message: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect(err.code).toBe('not_found');
  });
});

describe('buy_numbers + get_order', () => {
  it('orders daily lines, then the same reference returns the first order and charges nothing', async () => {
    const first = sc(await makeBuyNumbersHandler(cfg)({ count: 2, billing: 'daily', days: 5, customer_reference: 'agent-run-7' }));
    expect(first.duplicate).toBe(false);
    expect(first).toMatchObject({ status: 'fulfilled', ordered: 2, delivered: 2, billing: 'daily', charged_usd: 18 });
    expect(first.numbers).toHaveLength(2);
    const again = sc(await makeBuyNumbersHandler(cfg)({ count: 2, billing: 'daily', days: 5, customer_reference: 'agent-run-7' }));
    expect(again.duplicate).toBe(true);
    expect(again.order_id).toBe(first.order_id);
    const byRef = sc(await makeGetOrderHandler(cfg)({ order: 'agent-run-7' }));
    expect(byRef.order_id).toBe(first.order_id);
    const byId = sc(await makeGetOrderHandler(cfg)({ order: first.order_id }));
    expect(byId.numbers).toEqual(first.numbers);
  });
  it('a reference is generated when none is given, and returned', async () => {
    const r = sc(await makeBuyNumbersHandler(cfg)({ count: 1, billing: 'monthly', months: 2 }));
    expect(r.customer_reference).toMatch(/^mcp-/);
    expect(r.charged_usd).toBe(50);
  });
  it('an empty wallet is payment_required with advice', async () => {
    const err = await makeBuyNumbersHandler(cfg)({ count: 50, billing: 'monthly' }).catch((e) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect(err.code).toBe('payment_required');
    expect(err.message).toMatch(/Top up/);
  });
  it('unknown order is not_found', async () => {
    const err = await makeGetOrderHandler(cfg)({ order: 'nope' }).catch((e) => e);
    expect(err.code).toBe('not_found');
  });
});

describe('tool list', () => {
  it('registers the eight keyed tools and none of the removed ones', async () => {
    const server = buildServer(cfg);
    const names = Object.keys((server as any)._registeredTools || {});
    for (const n of ['get_account', 'get_number_pricing', 'buy_numbers', 'get_order', 'list_my_numbers', 'read_messages', 'wait_for_message', 'send_message']) expect(names).toContain(n);
    for (const n of ['search_sms_services', 'buy_sms_number', 'get_sms']) expect(names).not.toContain(n);
  });
  it('info-only keeps the retail discovery tools and nothing keyed', () => {
    const names = Object.keys((buildServer({ ...cfg, infoOnly: true }) as any)._registeredTools || {});
    expect(names.sort()).toEqual(['get_quote', 'search_plans', 'search_us_numbers']);
  });
});
