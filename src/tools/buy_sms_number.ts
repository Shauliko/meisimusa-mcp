// Tool: buy_sms_number — buy a US number for SMS verification of one service.
// Wraps POST /web/sms/checkout. Returns a Stripe payment link; after the
// customer pays, the number is assigned and the code is read via get_sms.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';

export const BUY_SMS_NUMBER_NAME = 'buy_sms_number';

export const buySmsNumberDescription =
  'Buy a US phone number to receive an SMS verification code for a specific service (use search_sms_services first to get the service_id). ' +
  'Returns a secure payment link; after the customer pays, poll get_sms with the returned order_id to read the code.';

export const buySmsNumberInput = {
  service_id: z.number().int().describe('The service_id from search_sms_services.'),
  customer_email: z.string().email().describe('Where the receipt is sent.'),
};

export function makeBuySmsNumberHandler(cfg: Config) {
  return async (args: { service_id: number; customer_email: string }) => {
    const data: any = await callBackend(cfg, {
      method: 'POST',
      path: '/web/sms/checkout',
      body: { serviceId: args.service_id, email: args.customer_email, language: 'en' },
    });
    const orderId = data?.shortId || null;
    const payUrl = data?.payUrl || null;
    const ok = !!(data?.ok && orderId && payUrl);
    const result = ok
      ? {
          order_id: String(orderId),
          status: 'pending' as const,
          payment_url: payUrl,
          amount: Number(data?.amountUsd || 0),
          currency: 'USD',
          message: 'Open payment_url to pay. After payment, poll get_sms with this order_id to get the number and the verification code.',
        }
      : {
          order_id: orderId ? String(orderId) : '',
          status: 'failed' as const,
          payment_url: null,
          amount: 0,
          currency: 'USD',
          error: String(data?.error || data?.message || 'Could not start SMS checkout'),
        };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: !ok };
  };
}
