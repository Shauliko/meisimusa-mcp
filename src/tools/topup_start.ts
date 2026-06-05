// Tool: topup_start — start a recharge of an existing line/eSIM. Wraps POST
// /web/topup/checkout. NOTE: the card path returns a Stripe client-secret
// (completed on our top-up page), not a hosted link like eSIM/SMS — so we
// return a payment_url that opens that page with the order. (A hosted top-up
// checkout is a small backend follow-up.)

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';

export const TOPUP_START_NAME = 'topup_start';

export const topupStartDescription =
  'Start a top-up/recharge for an existing line or eSIM, using a product_id from topup_lookup. Returns an order_id ' +
  'and a payment URL where the customer completes payment. For range plans, pass custom_amount.';

export const topupStartInput = {
  line_type: z.enum(['us_prepaid', 'esim']),
  product_id: z.string().describe('Top-up plan id from topup_lookup.'),
  customer_email: z.string().email(),
  phone: z.string().optional().describe('US phone (us_prepaid).'),
  carrier: z.string().optional(),
  iccid: z.string().optional().describe('eSIM ICCID (esim).'),
  source_order_id: z.string().optional().describe('Original eSIM order id (esim).'),
  custom_amount: z.number().positive().optional().describe('For range/RTR plans only.'),
};

const SITE = 'https://www.meisimusa.com';

export function makeTopupStartHandler(cfg: Config) {
  return async (args: {
    line_type: string; product_id: string; customer_email: string;
    phone?: string; carrier?: string; iccid?: string; source_order_id?: string; custom_amount?: number;
  }) => {
    const data: any = await callBackend(cfg, {
      method: 'POST',
      path: '/web/topup/checkout',
      body: {
        line_type: args.line_type,
        line_phone: args.phone,
        line_carrier: args.carrier,
        line_iccid: args.iccid,
        source_order_id: args.source_order_id,
        product_id: args.product_id,
        email: args.customer_email,
        payment_method: 'stripe',
        language: 'en',
        custom_amount: args.custom_amount,
      },
    });
    const shortId = data?.short_id || null;
    const ok = !!(data?.ok && shortId);
    const result = ok
      ? {
          order_id: String(shortId),
          status: 'pending' as const,
          payment_url: `${SITE}/topup.html?o=${encodeURIComponent(shortId)}`,
          amount: Number(data?.amount_usd || 0),
          currency: 'USD',
          product: data?.product_title || '',
          message: 'Open payment_url to complete the top-up payment on our secure page.',
        }
      : {
          order_id: shortId ? String(shortId) : '',
          status: 'failed' as const,
          payment_url: null,
          amount: 0,
          currency: 'USD',
          error: String(data?.error || data?.message || 'Could not start top-up'),
        };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: !ok };
  };
}
