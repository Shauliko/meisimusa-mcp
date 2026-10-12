// Tool: buy_numbers. Orders new numbers against the account's prepaid wallet.
// Wraps POST /api/v1/sms/order. The backend makes customer_reference an
// idempotency key (a repeat with the same reference returns the first order
// and charges nothing), so one is always sent: the model's, or one made here.
// The account's daily spending limit and wallet balance are enforced by the
// backend and come back as structured errors.

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { ToolError } from '../errors.js';
import { requireKey, publicOrder, text } from '../keyed.js';

export const BUY_NUMBERS_NAME = 'buy_numbers';

export const buyNumbersDescription =
  'Order new US phone numbers on your MeiSIM account, paid from its prepaid wallet. Prepaid: no returns, no refunds ' +
  'once a number is delivered. Choose billing "daily" (a minimum number of days paid now, then each day from the wallet) ' +
  'or "monthly" (a minimum number of months paid up front). Call get_number_pricing first and tell the user the total. ' +
  'Numbers usually land within about 15 minutes; check with get_order. Safe to retry with the same customer_reference. Needs your API key.';

export const buyNumbersInput = {
  count: z.number().int().min(1).max(50).describe('How many numbers.'),
  billing: z.enum(['daily', 'monthly']).describe('"daily" or "monthly". See get_number_pricing.'),
  days: z.number().int().min(1).max(365).optional().describe('Daily billing only: days to pay now (at least the minimum).'),
  months: z.number().int().min(1).max(12).optional().describe('Monthly billing only: months to pay up front (at least the minimum).'),
  voice: z.boolean().optional().describe('Also calls over SIP (costs more; must be enabled on the account).'),
  area_code: z.string().regex(/^\d{3}$/).optional().describe('Preferred 3-digit US area code, if available.'),
  zip_code: z.string().regex(/^\d{5}$/).optional().describe('5-digit US ZIP to pick the number\'s area, if available.'),
  customer_reference: z.string().max(120).optional().describe('Your own reference for this order; a repeat with the same reference returns the first order.'),
};

export function makeBuyNumbersHandler(cfg: Config) {
  return async (args: {
    count: number; billing: 'daily' | 'monthly'; days?: number; months?: number; voice?: boolean;
    area_code?: string; zip_code?: string; customer_reference?: string;
  }) => {
    requireKey(cfg);
    const customer_reference = (args.customer_reference || ('mcp-' + randomUUID())).replace(/[^A-Za-z0-9._\-:/#]/g, '-').slice(0, 120);
    const body: Record<string, unknown> = { count: args.count, billing: args.billing, customer_reference };
    if (args.billing === 'daily' && args.days != null) body.days = args.days;
    if (args.billing === 'monthly' && args.months != null) body.months = args.months;
    if (args.voice) body.voice = true;
    if (args.area_code) body.area_code = args.area_code;
    if (args.zip_code) body.zip_code = args.zip_code;
    let data: any;
    try {
      data = await callBackend(cfg, { method: 'POST', path: '/api/v1/sms/order', body });
    } catch (e) {
      if (e instanceof ToolError && e.status === 402) {
        throw new ToolError('payment_required', e.message + ' Top up the wallet on your MeiSIM dashboard, then retry with the same customer_reference.', { status: 402 });
      }
      throw e;
    }
    const order = publicOrder(data?.order ?? data);
    return text({
      ...order,
      duplicate: data?.duplicate === true,
      note: data?.duplicate
        ? 'An order with this customer_reference already existed; nothing new was ordered or charged.'
        : (data?.note || 'Ordered. Numbers appear on the account as the carrier releases them, usually within about 15 minutes. Check with get_order or list_my_numbers.'),
    });
  };
}
