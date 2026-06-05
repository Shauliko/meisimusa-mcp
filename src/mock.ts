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

  // ── SMS verification ──
  if (req.method === 'GET' && pathOnly === '/web/sms/services') {
    const q = (new URLSearchParams(query).get('q') || '').toLowerCase();
    let services = [
      { id: 1, serviceName: 'whatsapp', capability: 'sms', numberType: 'mobile', durationDays: 0, label: 'WhatsApp', emoji: '💬', priceUsd: 1.2, featured: true },
      { id: 2, serviceName: 'google', capability: 'sms', numberType: 'mobile', durationDays: 0, label: 'Google / Gmail', emoji: '🔵', priceUsd: 0.9, featured: true },
      { id: 3, serviceName: 'telegram', capability: 'sms', numberType: 'mobile', durationDays: 0, label: 'Telegram', emoji: '✈️', priceUsd: 1.1, featured: false },
    ];
    if (q) services = services.filter((s) => s.serviceName.includes(q) || s.label.toLowerCase().includes(q));
    return { ok: true, kind: 'verification', count: services.length, totalCount: services.length, offset: 0, limit: 60, services };
  }
  if (req.method === 'POST' && pathOnly === '/web/sms/checkout') {
    const id = 'sms_' + ++seq;
    ORDERS.set(id, { sms: true });
    return { ok: true, shortId: id, orderId: seq, clientSecret: 'cs_mock', payUrl: `https://www.meisimusa.com/sms-checkout.html?o=${id}`, inboxUrl: `https://www.meisimusa.com/sms-inbox.html?o=${id}`, amountUsd: 1.2 };
  }
  if (req.method === 'GET' && pathOnly?.startsWith('/web/sms/inbox/')) {
    const id = decodeURIComponent(pathOnly.slice('/web/sms/inbox/'.length));
    return {
      ok: true, shortId: id, productKind: 'verification', serviceName: 'whatsapp', capability: 'sms',
      paymentStatus: 'paid', tvState: 'active', assignedNumber: '+13055550123', expiresAt: null, closedAt: null, retailPriceUsd: 1.2,
      messages: [{ id: 'm1', from: 'WhatsApp', to: '+13055550123', body: 'Your WhatsApp code is 481-902', parsedCode: '481902', receivedAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
    };
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
