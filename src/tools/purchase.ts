// Tool 3: purchase — start a card purchase the customer completes themselves.
//
// Wraps POST /web/checkout, which creates a hosted Stripe Checkout Session and
// returns a payable URL. The customer opens it, pays with their own card, and
// MeiSIM's existing Stripe webhook provisions the eSIM and emails the QR. So
// the buyer pays — you don't front anything — and no API key is involved.
//
// Returns status "pending" plus payment_url. The order becomes "ready" (poll
// get_activation) once the customer has paid. Idempotency is enforced
// in-process: repeating an idempotency_key returns the same checkout instead
// of opening a second one.

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { idempotencyStore } from '../store.js';
import { log, mask } from '../logger.js';

export const PURCHASE_NAME = 'purchase';

export const purchaseDescription =
  'Begin buying an eSIM plan. Returns a secure Stripe payment link the customer opens to pay with ' +
  'their own card; the eSIM + QR are emailed automatically once payment clears. Poll get_activation ' +
  'with the returned order_id to fetch the QR. Safe to retry with the same idempotency_key.';

export const purchaseInput = {
  plan_id: z.string().describe('The plan_id (productId) to buy, from search_plans / get_quote.'),
  customer_email: z.string().email().describe('Where the eSIM/QR is emailed after payment.'),
  payment_method: z
    .object({ type: z.enum(['stored_card', 'stripe_payment_method']), token: z.string() })
    .optional()
    .describe('Not used: payment happens on the hosted Stripe page via payment_url. Reserved for a future direct-charge path.'),
  billing_country: z.string().length(2).optional(),
  idempotency_key: z
    .string()
    .uuid()
    .optional()
    .describe('Generated if omitted. Reusing a key returns the first checkout instead of starting another.'),
};

// /web/checkout validates a name; derive a clean one from the email.
function deriveName(email: string): string {
  const local = (email.split('@')[0] || '').replace(/[^a-zA-Z]+/g, ' ').trim();
  return local ? local.slice(0, 40).replace(/\b\w/g, (c) => c.toUpperCase()) : 'Traveler';
}

export function makePurchaseHandler(cfg: Config) {
  return async (args: {
    plan_id: string;
    customer_email: string;
    idempotency_key?: string;
  }) => {
    const key = args.idempotency_key || randomUUID();

    const prior = idempotencyStore.get(key);
    if (prior) {
      log.info('idempotent hit', { key: mask(key) });
      const out = { ...prior, idempotency_key: key, idempotent: true };
      return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }], structuredContent: out };
    }

    const data: any = await callBackend(cfg, {
      method: 'POST',
      path: '/web/checkout',
      body: {
        productId: args.plan_id,
        email: args.customer_email,
        name: deriveName(args.customer_email),
        paymentMethod: 'card',   // /web/checkout requires this exact field name
        quantity: 1,
        language: 'en',
      },
    });

    const orderId = data?.orderId || data?.order_id || null;
    const checkoutUrl = data?.checkoutUrl || data?.checkout_url || data?.url || null;
    const ok = !!(data?.ok && orderId && checkoutUrl);

    const result = ok
      ? {
          order_id: String(orderId),
          status: 'pending' as const,
          payment_url: checkoutUrl,
          receipt_url: null as string | null,
          message: 'Open payment_url to pay. The eSIM QR is emailed on payment; poll get_activation with order_id.',
        }
      : {
          order_id: orderId ? String(orderId) : key,
          status: 'failed' as const,
          payment_url: null,
          receipt_url: null as string | null,
          error: String(data?.error || data?.message || 'Could not start checkout'),
        };

    idempotencyStore.set(key, {
      order_id: result.order_id,
      status: result.status,
      receipt_url: result.receipt_url,
      ...(('error' in result) ? { error: (result as any).error } : {}),
    });

    const out = { ...result, idempotency_key: key };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
      structuredContent: out,
      isError: !ok,
    };
  };
}
