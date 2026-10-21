// Tool: send_message. A text from one of your numbers. Sending is switched on
// per account and each number has a monthly allowance, so this can be
// refused; the refusal says why. Wraps POST /api/v1/sms/lines/:number/send.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { requireKey, usNumber10, text } from '../keyed.js';

export const SEND_MESSAGE_NAME = 'send_message';

export const sendMessageDescription =
  'Send a text message from one of your MeiSIM numbers to a US number. Sending must be enabled on your ' +
  'account and each number has a monthly allowance; a refusal tells you which. The answer means accepted by the carrier: ' +
  'a mobile line has no delivery receipt. The same text to more than three numbers from one line inside a minute is refused ' +
  '(carriers drop that as a broadcast); write to each person in their own words. Not for emergency services. Needs your API key.';

export const sendMessageInput = {
  from: z.string().max(20).describe('One of your numbers.'),
  to: z.string().max(20).describe('The destination number, e.g. "+1 212 555 0100".'),
  message: z.string().min(1).max(800).describe('The text to send, up to 800 characters.'),
};

export function makeSendMessageHandler(cfg: Config) {
  return async (args: { from: string; to: string; message: string }) => {
    requireKey(cfg);
    const data: any = await callBackend(cfg, {
      method: 'POST',
      path: '/api/v1/sms/lines/' + encodeURIComponent(usNumber10(args.from)) + '/send',
      body: { to: args.to, message: args.message },
    });
    return text({ sent: data?.ok === true, from: data?.from ?? usNumber10(args.from), to: data?.to ?? args.to, note: data?.note ?? null });
  };
}
