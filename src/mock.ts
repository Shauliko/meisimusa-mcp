// Deterministic in-memory backend for `--mock`. Mirrors the PUBLIC retail
// endpoints (/mm/products, /mm/products/:id, /web/checkout, /web/order/:id) so
// the whole consumer flow runs offline with no key. Responses match the real
// shapes, so the production normalizer/handlers run unchanged. The mock marks
// orders as paid+fulfilled immediately so get_activation can show a "ready" QR.

import type { BackendRequest } from './http.js';
import { ToolError } from './errors.js';

interface RetailProduct {
  productId: string;
  providerName: string;
  retailPrice: number;
  productCategory: string;
  countries: string[];
  regions: string[];
  productDetails: { name: string; value: string }[];
}

const det = (title: string, dataGb: string, days: string, nets: string) => [
  { name: 'PLAN_TITLE', value: title },
  { name: 'PLAN_DATA_LIMIT', value: dataGb },
  { name: 'VALIDITY_IN_DAYS', value: days },
  { name: 'NETWORKS', value: nets },
];

const CATALOG: Record<string, RetailProduct[]> = {
  IT: [
    { productId: 'mm_IT_1gb_7d',  providerName: 'Mobimatter', retailPrice: 4.5,  productCategory: 'esim_realtime', countries: ['IT', 'Italy'], regions: ['Europe'], productDetails: det('Italy 1GB 7 days', '1 GB', '7', 'TIM, Vodafone') },
    { productId: 'mm_IT_5gb_30d', providerName: 'Mobimatter', retailPrice: 9.5,  productCategory: 'esim_realtime', countries: ['IT', 'Italy'], regions: ['Europe'], productDetails: det('Italy 5GB 30 days', '5 GB', '30', 'TIM, Vodafone') },
    { productId: 'mm_IT_10gb_30d',providerName: 'Mobimatter', retailPrice: 14.0, productCategory: 'esim_realtime', countries: ['IT', 'Italy'], regions: ['Europe'], productDetails: det('Italy 10GB 30 days', '10 GB', '30', 'TIM, Vodafone') },
    { productId: 'mm_IT_UL_15d',  providerName: 'Mobimatter', retailPrice: 26.0, productCategory: 'esim_realtime', countries: ['IT', 'Italy'], regions: ['Europe'], productDetails: det('Italy Unlimited 15 days', 'Unlimited', '15', 'TIM') },
  ],
  JP: [
    { productId: 'mm_JP_3gb_15d', providerName: 'Mobimatter', retailPrice: 8.0,  productCategory: 'esim_realtime', countries: ['JP', 'Japan'], regions: ['Asia'], productDetails: det('Japan 3GB 15 days', '3 GB', '15', 'NTT Docomo, SoftBank') },
    { productId: 'mm_JP_10gb_30d',providerName: 'Mobimatter', retailPrice: 17.0, productCategory: 'esim_realtime', countries: ['JP', 'Japan'], regions: ['Asia'], productDetails: det('Japan 10GB 30 days', '10 GB', '30', 'NTT Docomo, SoftBank') },
  ],
};

const ORDERS = new Map<string, any>();
let seq = 1000;

export function mockBackend(req: BackendRequest): unknown {
  const [pathOnly, query = ''] = req.path.split('?');

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
    const body = (req.body || {}) as { productId?: string; email?: string };
    const product = Object.values(CATALOG).flat().find((p) => p.productId === body.productId);
    if (!product) throw new ToolError('not_found', `Mock: product ${body.productId} not found`, { status: 404 });
    const orderId = 'web_' + ++seq;
    // Mock simulates a completed payment so the activation chain is demoable.
    ORDERS.set(orderId, {
      id: orderId, short_id: 'MeiWeb-' + seq, product_id: product.productId,
      email: body.email, order_state: 'fulfilled', payment_status: 'paid',
      qr_code: 'LPA:1$smdp.example.com$' + orderId.toUpperCase(),
      lpa: 'LPA:1$smdp.example.com$' + orderId.toUpperCase(),
      activation_code: 'LPA:1$smdp.example.com$' + orderId.toUpperCase(),
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

  throw new ToolError('not_found', 'Mock has no handler for ' + req.method + ' ' + pathOnly, { status: 404 });
}
