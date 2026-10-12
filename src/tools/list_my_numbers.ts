// Tool: list_my_numbers. The numbers on the account, paged. Wraps
// GET /api/v1/sms/lines.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { requireKey, publicNumber, text } from '../keyed.js';

export const LIST_MY_NUMBERS_NAME = 'list_my_numbers';

export const listMyNumbersDescription =
  'List the US phone numbers on your MeiSIM account: number, status, whether it has voice, how it is billed ' +
  'and the date it is paid through. Paged; pass next_offset to continue. Needs your API key.';

export const listMyNumbersInput = {
  search: z.string().max(40).optional().describe('Optional: part of a number or a label to filter by.'),
  limit: z.number().int().min(1).max(500).optional().describe('Numbers per page, default 100.'),
  offset: z.number().int().min(0).optional().describe('Where to start; use next_offset from the previous page.'),
};

export function makeListMyNumbersHandler(cfg: Config) {
  return async (args: { search?: string; limit?: number; offset?: number }) => {
    requireKey(cfg);
    const qs = new URLSearchParams();
    if (args.search) qs.set('q', args.search);
    qs.set('limit', String(args.limit ?? 100));
    qs.set('offset', String(args.offset ?? 0));
    const data: any = await callBackend(cfg, { method: 'GET', path: '/api/v1/sms/lines?' + qs.toString() });
    const numbers = (Array.isArray(data?.lines) ? data.lines : []).map(publicNumber);
    const result: Record<string, unknown> = {
      numbers,
      total: Number(data?.total ?? numbers.length),
      next_offset: data?.next_offset ?? null,
    };
    if (Array.isArray(data?.incoming) && data.incoming.length) result.incoming = data.incoming;
    if (data?.incoming_note) result.note = data.incoming_note;
    if (!numbers.length && !result.incoming) result.note = 'No numbers on this account yet. get_number_pricing shows what one costs; buy_numbers orders.';
    return text(result);
  };
}
