// Tool: get_order. One number order by order_id or customer_reference:
// how many landed, which numbers, what was charged. Wraps
// GET /api/v1/sms/orders/:id.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { requireKey, publicOrder, text } from '../keyed.js';

export const GET_ORDER_NAME = 'get_order';

export const getOrderDescription =
  'Check a number order from buy_numbers: status (provisioning, partially_fulfilled, fulfilled, delayed, cancelled, closed_refunded), ' +
  'the numbers delivered so far and what was charged. Pass the order_id or your customer_reference. Needs your API key.';

export const getOrderInput = {
  order: z.string().max(120).describe('The order_id or the customer_reference.'),
};

export function makeGetOrderHandler(cfg: Config) {
  return async (args: { order: string }) => {
    requireKey(cfg);
    const data: any = await callBackend(cfg, { method: 'GET', path: '/api/v1/sms/orders/' + encodeURIComponent(args.order) });
    return text(publicOrder(data?.order ?? data));
  };
}
