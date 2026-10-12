// Tool: read_messages. Texts received on your numbers, newest first. Wraps
// GET /api/v1/sms/messages. `since` is what makes polling exact: ask for
// everything after the last message you saw and nothing is missed.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { requireKey, publicMessage, usNumber10, text } from '../keyed.js';

export const READ_MESSAGES_NAME = 'read_messages';

export const readMessagesDescription =
  'Read the text messages received on your MeiSIM numbers, newest first. Filter to one number and/or to messages ' +
  'after a timestamp. To follow a conversation, pass the received_at of the last message you saw as since. Needs your API key.';

export const readMessagesInput = {
  number: z.string().max(20).optional().describe('One of your numbers, e.g. "4234322309" or "+1 423 432 2309". Omit for all numbers.'),
  since: z.string().max(40).optional().describe('ISO 8601 timestamp; only messages received after it.'),
  limit: z.number().int().min(1).max(200).optional().describe('Default 50.'),
};

export async function fetchMessages(cfg: Config, args: { number?: string; since?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (args.number) qs.set('number', usNumber10(args.number));
  if (args.since) qs.set('since', args.since);
  qs.set('limit', String(args.limit ?? 50));
  const data: any = await callBackend(cfg, { method: 'GET', path: '/api/v1/sms/messages?' + qs.toString() });
  return (Array.isArray(data?.messages) ? data.messages : []).map(publicMessage);
}

export function makeReadMessagesHandler(cfg: Config) {
  return async (args: { number?: string; since?: string; limit?: number }) => {
    requireKey(cfg);
    const messages = await fetchMessages(cfg, args);
    const result: Record<string, unknown> = {
      messages,
      count: messages.length,
      newest_received_at: messages[0]?.received_at ?? null,
    };
    if (!messages.length) result.note = args.since ? 'Nothing new since ' + args.since + '.' : 'No messages on ' + (args.number ? 'that number' : 'this account') + ' yet.';
    return text(result);
  };
}
