import { describe, it, expect } from 'vitest';
import type { Config } from '../src/config.js';
import { VERSION } from '../src/config.js';
import { makeGetQuoteHandler } from '../src/tools/get_quote.js';
import { makePurchaseHandler } from '../src/tools/purchase.js';
import { makeGetActivationHandler } from '../src/tools/get_activation.js';
import { ToolError } from '../src/errors.js';

const cfg: Config = {
  baseUrl: 'https://meisimusa-backend.vercel.app',
  apiKey: undefined,
  priceCurrency: 'USD',
  mock: true,
  timeoutMs: 5000,
  version: VERSION,
};

const sc = (r: { structuredContent?: unknown }) => r.structuredContent as any;

describe('get_quote (retail)', () => {
  it('happy path: USD price breakdown for a known plan', async () => {
    const q = sc(await makeGetQuoteHandler(cfg)({ plan_id: 'mm_IT_5gb_30d' }));
    expect(q.plan.plan_id).toBe('mm_IT_5gb_30d');
    expect(q.total.final).toBe(q.total.subtotal);
    expect(q.total.currency).toBe('USD');
    expect(q.total.taxes).toBe(0);
  });

  it('unknown plan → ToolError not_found', async () => {
    await expect(makeGetQuoteHandler(cfg)({ plan_id: 'nope' })).rejects.toBeInstanceOf(ToolError);
  });
});

describe('purchase + get_activation (retail / Stripe link)', () => {
  it('returns a pending order with a payment link, then a ready activation', async () => {
    const p = sc(await makePurchaseHandler(cfg)({ plan_id: 'mm_IT_5gb_30d', customer_email: 'jane.doe@example.com' }));
    expect(p.status).toBe('pending');
    expect(p.payment_url).toContain('stripe.com');
    expect(p.order_id).toBeTruthy();

    const a = sc(await makeGetActivationHandler(cfg)({ order_id: p.order_id }));
    expect(a.status).toBe('ready'); // mock simulates a paid+fulfilled order
    expect(a.activation_code).toBeTruthy();
    expect(a.install_instructions.ios).toContain('eSIM');
  });

  it('idempotency: same key returns the first checkout, no second order', async () => {
    const buy = makePurchaseHandler(cfg);
    const key = '44444444-4444-4444-4444-444444444444';
    const first = sc(await buy({ plan_id: 'mm_JP_10gb_30d', customer_email: 'a@b.com', idempotency_key: key }));
    const again = sc(await buy({ plan_id: 'mm_JP_10gb_30d', customer_email: 'a@b.com', idempotency_key: key }));
    expect(again.idempotent).toBe(true);
    expect(again.order_id).toBe(first.order_id);
  });
});
