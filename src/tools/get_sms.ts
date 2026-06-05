// Tool: get_sms — read the assigned number and any received SMS (incl. the
// parsed verification code) for an SMS order. Wraps GET /web/sms/inbox/:id.
// Poll this after buy_sms_number once the customer has paid.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';

export const GET_SMS_NAME = 'get_sms';

export const getSmsDescription =
  'Get the assigned US number and any received SMS (with the parsed verification code) for an SMS order. ' +
  'Pass the order_id from buy_sms_number. Poll every few seconds after payment until a code arrives.';

export const getSmsInput = {
  order_id: z.string().describe('The order_id returned by buy_sms_number.'),
};

export function makeGetSmsHandler(cfg: Config) {
  return async (args: { order_id: string }) => {
    const data: any = await callBackend(cfg, {
      method: 'GET',
      path: `/web/sms/inbox/${encodeURIComponent(args.order_id)}`,
    });
    const messages = Array.isArray(data?.messages)
      ? data.messages.map((m: any) => ({
          from: m.from || '',
          body: m.body || '',
          code: m.parsedCode || null,
          received_at: m.receivedAt || null,
        }))
      : [];
    const paid = String(data?.paymentStatus || '').toLowerCase() === 'paid';
    const result = {
      status: data?.assignedNumber ? 'ready' : (paid ? 'provisioning' : 'awaiting_payment'),
      assigned_number: data?.assignedNumber || null,
      expires_at: data?.expiresAt || null,
      messages,
      latest_code: messages.find((m: any) => m.code)?.code || null,
      note: messages.length ? undefined : 'No SMS yet. If just paid, wait a few seconds and poll again.',
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
  };
}
