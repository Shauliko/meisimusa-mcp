// Deterministic in-memory backend for `--mock`. Mirrors the PUBLIC endpoints
// (catalog, checkout, order, SMS, top-up) so the whole storefront runs offline
// with no key. Responses match the real shapes so production handlers run
// unchanged.

import type { BackendRequest } from './http.js';
import { ToolError } from './errors.js';

interface RetailProduct {
  productId: string; providerName: string; retailPrice: number; productCategory: string;
  countries: string[]; regions: string[]; productDetails: { name: string; value: string }[];
}

const det = (title: string, dataGb: string, days: string, nets: string) => [
  { name: 'PLAN_TITLE', value: title }, { name: 'PLAN_DATA_LIMIT', value: dataGb },
  { name: 'VALIDITY_IN_DAYS', value: days }, { name: 'NETWORKS', value: nets },
];

const CATALOG: Record<string, RetailProduct[]> = {
  IT: [
    { productId: 'mm_IT_1gb_7d',  providerName: 'Mobimatter', retailPrice: 4.5,  productCategory: 'esim_realtime', countries: ['IT', 'Italy'], regions: ['Europe'], productDetails: det('Italy 1GB 7 days', '1 GB', '7', 'TIM, Vodafone') },
    { productId: 'mm_IT_5gb_30d', providerName: 'Mobimatter', retailPrice: 9.5,  productCategory: 'esim_realtime', countries: ['IT', 'Italy'], regions: ['Europe'], productDetails: det('Italy 5GB 30 days', '5 GB', '30', 'TIM, Vodafone') },
    { productId: 'mm_IT_10gb_30d',providerName: 'Mobimatter', retailPrice: 14.0, productCategory: 'esim_realtime', countries: ['IT', 'Italy'], regions: ['Europe'], productDetails: det('Italy 10GB 30 days', '10 GB', '30', 'TIM, Vodafone') },
  ],
  JP: [
    { productId: 'mm_JP_3gb_15d', providerName: 'Mobimatter', retailPrice: 8.0,  productCategory: 'esim_realtime', countries: ['JP', 'Japan'], regions: ['Asia'], productDetails: det('Japan 3GB 15 days', '3 GB', '15', 'NTT Docomo') },
    { productId: 'mm_JP_10gb_30d',providerName: 'Mobimatter', retailPrice: 17.0, productCategory: 'esim_realtime', countries: ['JP', 'Japan'], regions: ['Asia'], productDetails: det('Japan 10GB 30 days', '10 GB', '30', 'NTT Docomo') },
  ],
  US: [
    { productId: 'mm_US_5gb_30d', providerName: 'Mobimatter', retailPrice: 12.0, productCategory: 'esim_realtime', countries: ['US', 'United States'], regions: ['Americas'], productDetails: det('USA 5GB 30 days', '5 GB', '30', 'AT&T, T-Mobile') },
    { productId: 'p3:1:100', providerName: 'MeiSIM', retailPrice: 25.0, productCategory: 'esim_realtime', countries: ['US', 'United States'], regions: ['United States'],
      productDetails: [
        { name: 'PLAN_TITLE', value: 'US Number — Unlimited talk, text & 5GB' },
        { name: 'PLAN_NETWORK', value: 'AT&T' }, { name: 'VOICE', value: 'Unlimited' }, { name: 'SMS', value: 'Unlimited' },
        { name: 'PLAN_DATA_LIMIT', value: '5 GB' }, { name: 'VALIDITY_IN_DAYS', value: '30' },
        { name: 'PRODUCT_TYPE', value: 'US_NUMBER' }, { name: 'INCLUDES_NUMBER', value: 'YES' },
      ] },
  ],
};

const ORDERS = new Map<string, any>();

// Two numbers on the mock account, one of them with voice; one text received
// a minute ago. Shapes match GET /api/v1/sms/lines and /api/v1/sms/messages.
const MY_LINES = [
  { number: '4234322309', e164: '+14234322309', iccid: '8901240397144518660', order_id: '20447980-3fbb-46f3-a49e-5532b7d812c9', customer_reference: 'sip-platform-test-2', label: null, status: 'active', activated_at: '2026-10-12T01:29:59Z', last_sms_at: null, expires_at: '2026-10-15T04:00:00Z', auto_renew: false, billing: 'daily', daily_price_usd: 1.5, daily_paid_through: '2026-10-15', daily_stop: false, daily_unpaid_since: null, voice: true, renews: 'Daily rate: charged each morning for the next day while your wallet has funds.', cancels_at_local: '2026-10-15 22:00 US Eastern' },
  { number: '2696555552', e164: '+12696555552', iccid: '8901240397144621456', order_id: null, customer_reference: null, label: 'inbox', status: 'active', activated_at: '2026-09-20T10:00:00Z', last_sms_at: '2026-10-12T06:00:00Z', expires_at: '2026-11-19T04:00:00Z', auto_renew: true, billing: 'monthly', voice: false, renews: 'Renews monthly from your wallet.', cancels_at_local: null },
];
const MY_MESSAGES = [
  { id: 'm-1001', to: '2696555552', from: '12125550100', text: 'Your table for two is confirmed for 7pm.', otp: null, received_at: new Date(Date.now() - 60_000).toISOString() },
];
let seq = 1000;

export function mockBackend(req: BackendRequest): unknown {
  const [pathOnly, query = ''] = req.path.split('?');
  const body = (req.body || {}) as any;

  if (req.method === 'GET' && pathOnly === '/mm/products') {
    const iso = (new URLSearchParams(query).get('country') || '').toUpperCase();
    const products = CATALOG[iso] || [];
    return { ok: true, count: products.length, products };
  }
  if (req.method === 'GET' && pathOnly?.startsWith('/mm/products/')) {
    const id = decodeURIComponent(pathOnly.slice('/mm/products/'.length));
    const product = Object.values(CATALOG).flat().find((p) => p.productId === id);
    if (!product) throw new ToolError('not_found', `Mock: product ${id} not found`, { status: 404 });
    return { ok: true, product };
  }
  if (req.method === 'POST' && pathOnly === '/web/checkout') {
    const product = Object.values(CATALOG).flat().find((p) => p.productId === body.productId);
    if (!product) throw new ToolError('not_found', `Mock: product ${body.productId} not found`, { status: 404 });
    const orderId = 'web_' + ++seq;
    const lpa = 'LPA:1$smdp.example.com$' + orderId.toUpperCase();
    ORDERS.set(orderId, {
      id: orderId, short_id: 'MeiWeb-' + seq, product_id: product.productId, email: body.email,
      order_state: 'fulfilled', payment_status: 'paid', qr_code: lpa, lpa, activation_code: lpa,
      smdp: 'smdp.example.com', iccid: '8944' + orderId.replace(/\D/g, '').padStart(15, '0').slice(0, 15),
    });
    return { ok: true, checkoutUrl: `https://checkout.stripe.com/c/pay/mock_${orderId}`, orderId };
  }
  if (req.method === 'GET' && pathOnly?.startsWith('/web/order/')) {
    const id = decodeURIComponent(pathOnly.slice('/web/order/'.length));
    const order = ORDERS.get(id);
    if (!order) throw new ToolError('not_found', `Mock: order ${id} not found`, { status: 404 });
    return { ok: true, order, product: null };
  }

  // ── Your numbers (API key) ──
  if (req.method === 'GET' && pathOnly === '/api/v1/me') {
    return { id: 'dealer_mock', company_name: 'Mock Agents Inc', email: 'agents@example.com', status: 'approved', daily_line_limit: 20, lines_today: 2, lines_remaining_today: 18 };
  }
  if (req.method === 'GET' && pathOnly === '/dealer/wallet') {
    return { ok: true, balance: 69.25, company: 'Mock Agents Inc', markupPct: 15, resendFee: 1, transactions: [] };
  }
  if (req.method === 'GET' && pathOnly === '/dealer/sms-lines/offer') {
    return {
      ok: true, enabled: true, can_order: true, price_per_line_usd: 25, first_month_usd: 25, renew_price_usd: 25, min_months: 2, two_months_usd: 50,
      daily: { available: true, price_usd: 1, voice_price_usd: 1.5, min_days: 5, activation_fee_usd: 4, voice_activation_fee_usd: 5, fee_waived_from_stock: false, ready_now: { sms: 29, voice: 0 }, note: 'Pay by the day. Every activation is 5 days minimum.' },
      voice: { available: true, price_usd: 35, renew_price_usd: 35, note: 'Calls in and out over SIP.' },
    };
  }
  if (req.method === 'GET' && pathOnly === '/api/v1/sms/lines') {
    const qp = new URLSearchParams(query);
    const q = (qp.get('q') || '').replace(/\D/g, '');
    const lines = MY_LINES.filter((l) => !q || l.number.includes(q));
    const offset = Number(qp.get('offset') || 0), limit = Number(qp.get('limit') || 100);
    const page = lines.slice(offset, offset + limit);
    return { ok: true, total: lines.length, offset, limit, next_offset: offset + page.length < lines.length ? offset + page.length : undefined, count: page.length, lines: page };
  }
  if (req.method === 'GET' && pathOnly === '/api/v1/sms/messages') {
    const qp = new URLSearchParams(query);
    const num = qp.get('number') || '';
    const since = qp.get('since');
    if (since && isNaN(Date.parse(since))) throw new ToolError('invalid_input', 'since must be an ISO 8601 timestamp', { status: 400 });
    if (num && !MY_LINES.some((l) => l.number === num)) return { ok: true, count: 0, messages: [] };
    let msgs = MY_MESSAGES.filter((m) => !num || m.to === num);
    if (since) msgs = msgs.filter((m) => Date.parse(m.received_at) > Date.parse(since));
    msgs = msgs.slice(0, Number(qp.get('limit') || 50));
    return { ok: true, count: msgs.length, messages: msgs };
  }
  const sendM = req.method === 'POST' && /^\/api\/v1\/sms\/lines\/(\d{10})\/send$/.exec(pathOnly || '');
  if (sendM) {
    const line = MY_LINES.find((l) => l.number === sendM[1]);
    if (!line) throw new ToolError('not_found', 'That number is not one of yours.', { status: 404 });
    if (!String(body.message || '').trim()) throw new ToolError('invalid_input', 'The message is empty.', { status: 400 });
    return { ok: true, from: line.number, to: String(body.to || '').replace(/\D/g, ''), to_kind: 'us', note: 'Sent. Each number has its own monthly sending allowance.' };
  }
  if (req.method === 'POST' && pathOnly === '/api/v1/sms/order') {
    const ref = String(body.customer_reference || '');
    const prior = [...ORDERS.values()].find((o) => o.sms_order && o.customer_reference === ref);
    if (prior) return { ok: true, duplicate: true, note: 'An order with this customer_reference already exists; nothing new was ordered or charged.', order: prior };
    const count = Number(body.count || 0);
    const daily = body.billing === 'daily';
    const charged = daily ? count * (5 * (body.voice ? 1.5 : 1) + (body.voice ? 5 : 4)) : count * 50;
    if (charged > 69.25) {
      throw new ToolError('payment_required', 'Not enough in your wallet', { status: 402 });
    }
    const id = '00000000-0000-4000-8000-' + String(++seq).padStart(12, '0');
    const order = {
      sms_order: true, order_id: id, customer_reference: ref || null, status: 'fulfilled', ordered: count, delivered: count, outstanding: 0,
      refunded_numbers: 0, refunded_usd: 0, refunded_at: null,
      numbers: Array.from({ length: count }, (_, i) => '555010' + String(seq + i).slice(-4)),
      billing: daily ? 'daily' : 'monthly', voice: body.voice === true, days_paid: daily ? (body.days || 5) : null,
      charged_usd: charged, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    };
    ORDERS.set(id, order);
    return { ok: true, order };
  }
  if (req.method === 'GET' && pathOnly?.startsWith('/api/v1/sms/orders/')) {
    const id = decodeURIComponent(pathOnly.slice('/api/v1/sms/orders/'.length));
    const order = ORDERS.get(id) || [...ORDERS.values()].find((o) => o.sms_order && o.customer_reference === id);
    if (!order || !order.sms_order) throw new ToolError('not_found', 'No order with that order_id or customer_reference on your account.', { status: 404 });
    return { ok: true, order };
  }

  // ── Top-up ──
  if (req.method === 'GET' && pathOnly === '/web/topup/carriers') {
    return { ok: true, carriers: [{ id: 1, name: 'AT&T' }, { id: 2, name: 'T-Mobile' }] };
  }
  if (req.method === 'POST' && pathOnly === '/web/topup/lookup') {
    return {
      ok: true, lines: [{
        line_type: 'us_prepaid', line_label: 'AT&T ' + (body.phone || ''), phone: body.phone || '+13055550123', carrier: 'AT&T', carrier_id: 1, plan_title: null,
        addons: [
          { id: 'tp_att_30', description: 'AT&T $30 Unlimited talk/text + 5GB', dataLimit: '5 GB', validity: '30 days', retailPrice: 34, isRtr: false },
          { id: 'tp_att_50', description: 'AT&T $50 Unlimited + 15GB', dataLimit: '15 GB', validity: '30 days', retailPrice: 56, isRtr: false },
        ],
      }] };
  }
  if (req.method === 'POST' && pathOnly === '/web/topup/checkout') {
    const id = 'tu_' + ++seq;
    return { ok: true, short_id: id, topup_id: seq, clientSecret: 'cs_mock', publishableKey: 'pk_mock', amount_usd: 34, face_usd: 30, fee_usd: 4, product_title: 'AT&T $30 top-up' };
  }

  throw new ToolError('not_found', 'Mock has no handler for ' + req.method + ' ' + pathOnly, { status: 404 });
}
