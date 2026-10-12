// Tool: wait_for_message. Block for up to timeout_seconds until a text arrives
// on one of your numbers, then return it. One tool call instead of an agent
// loop of read_messages. Polls the same endpoint every few seconds.

import { z } from 'zod';
import type { Config } from '../config.js';
import { requireKey, text } from '../keyed.js';
import { fetchMessages } from './read_messages.js';

export const WAIT_FOR_MESSAGE_NAME = 'wait_for_message';

export const waitForMessageDescription =
  'Wait for the next text message on one of your MeiSIM numbers and return it. Blocks up to timeout_seconds ' +
  '(default 30, max 50). Pass since as the time you started waiting (default: now) so an older message is not mistaken ' +
  'for the new one. If nothing arrives, received is false; call again to keep waiting. Needs your API key.';

export const waitForMessageInput = {
  number: z.string().max(20).optional().describe('One of your numbers. Omit to watch every number on the account.'),
  since: z.string().max(40).optional().describe('ISO 8601; only a message received after this counts. Default: now.'),
  timeout_seconds: z.number().int().min(1).max(50).optional().describe('How long to wait, default 30.'),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeWaitForMessageHandler(cfg: Config) {
  return async (args: { number?: string; since?: string; timeout_seconds?: number }) => {
    requireKey(cfg);
    const started = Date.now();
    const since = args.since || new Date(started - 1000).toISOString();
    const budget = Math.min(50, Math.max(1, args.timeout_seconds ?? 30)) * 1000;
    const interval = cfg.mock ? 50 : 3000;
    for (;;) {
      const messages = await fetchMessages(cfg, { number: args.number, since, limit: 20 });
      if (messages.length) {
        return text({ received: true, messages, waited_seconds: Math.round((Date.now() - started) / 1000), since });
      }
      if (Date.now() - started + interval > budget) break;
      await sleep(interval);
    }
    return text({
      received: false, messages: [], waited_seconds: Math.round((Date.now() - started) / 1000), since,
      note: 'No message arrived in that time. Call wait_for_message again with the same since to keep waiting.',
    });
  };
}
