// Tool: get_ai_line_offer — the public offer for real US phone lines for AI
// agents. Wraps GET /web/ai-lines/offer, which reads the live prices and the
// first-term minimum from the backend's own settings, so this server never
// carries a copy of a price. No key, no customer data. Directory build only.
//
// It does not say how many numbers are ready (2026-11-12). It used to, and a
// count of a few dozen reads as "that is all they have" to somebody who needs
// hundreds; a new number is activated in minutes, so stock is not a limit.
// What it says for that reader instead: who to write to for a price on
// hundreds of lines.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';

export const GET_AI_LINE_OFFER_NAME = 'get_ai_line_offer';

// The exact directory listing text. What it returns and who it is for; nothing about other tools.
export const getAiLineOfferDescription =
  'MeiSIM\'s current offer for real US phone lines used by AI agents: the monthly price per number for texts, and ' +
  'for texts plus voice over SIP; the first-term minimum; what a line includes (a real US mobile number on a national ' +
  'carrier, inbound texts to a webhook or over the API, voice over SIP with the number as caller ID, one call at a ' +
  'time, outbound calls to US numbers only); delivery time; payment methods; who to write to for a price on hundreds ' +
  'of lines; and links to apply and to the API docs. For people building voice agents, phone assistants, companion apps or SMS ' +
  'customer service who ask what a line costs, what it includes or how to get one. Takes no input. Read-only: it ' +
  'cannot open an account or order a line.';

export const getAiLineOfferInput = {};

const VOLUME_CONTACT = 'support@meisimusa.com';
const VOLUME_NOTE = 'Need hundreds of lines? Write to ' + VOLUME_CONTACT + ' with how many you need and we will send you a price.';

export const aiLineOfferOutput = {
  product: z.string(),
  currency: z.string(),
  monthly: z.object({ texts_usd: z.number(), voice_usd: z.number(), note: z.string() }),
  usage_billed_separately: z.boolean(),
  min_months: z.number().int(),
  term_note: z.string(),
  includes: z.array(z.string()),
  delivery: z.object({ from_stock: z.string(), new_number: z.string(), account: z.string() }),
  payment_methods: z.array(z.string()),
  volume_pricing: z.string(),
  volume_contact: z.string(),
  apply_url: z.string(),
  docs_url: z.string(),
  how_to_get_one: z.string(),
};

export function makeGetAiLineOfferHandler(cfg: Config) {
  return async (_args: Record<string, never>) => {
    const d: any = await callBackend(cfg, { method: 'GET', path: '/web/ai-lines/offer' });
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const result = {
      product: String(d?.product || 'Real US phone lines for AI agents'),
      currency: String(d?.currency || 'USD'),
      monthly: {
        texts_usd: num(d?.monthly?.texts_usd),
        voice_usd: num(d?.monthly?.voice_usd),
        note: String(d?.monthly?.note || 'Per number, per month, all inclusive: no per-message or per-minute charges.'),
      },
      usage_billed_separately: d?.usage_billed_separately === true,
      min_months: Math.max(1, Math.trunc(num(d?.min_months)) || 1),
      term_note: String(d?.term_note || ''),
      includes: Array.isArray(d?.includes) ? d.includes.map((x: unknown) => String(x)) : [],
      delivery: {
        from_stock: String(d?.delivery?.from_stock || ''),
        new_number: String(d?.delivery?.new_number || ''),
        account: String(d?.delivery?.account || ''),
      },
      payment_methods: Array.isArray(d?.payment_methods) ? d.payment_methods.map((x: unknown) => String(x)) : [],
      // Hundreds of lines are priced by a person. The backend's own sentence
      // and address; the words here are only for a backend that sends none.
      volume_pricing: String(d?.volume_pricing || VOLUME_NOTE),
      volume_contact: String(d?.volume_contact || VOLUME_CONTACT),
      apply_url: String(d?.apply_url || 'https://www.meisimusa.com/api-for-ai-agents.html'),
      docs_url: String(d?.docs_url || 'https://www.meisimusa.com/api-docs.html'),
      how_to_get_one:
        'Apply at apply_url (a person approves the account, usually the same day), then order numbers by API or from ' +
        'the dashboard. This connector only reads the offer; it cannot open an account or buy a line.',
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
  };
}
