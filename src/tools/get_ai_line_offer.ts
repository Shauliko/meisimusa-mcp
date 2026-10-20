// Tool: get_ai_line_offer — the public offer for real US phone lines for AI
// agents. Wraps GET /web/ai-lines/offer, which reads the live prices, the
// first-term minimum and the stock count from the backend's own settings, so
// this server never carries a copy of a price. No key, no customer data.
// Directory build only.

import { z } from 'zod';
import type { Config } from '../config.js';
import { callBackend } from '../http.js';

export const GET_AI_LINE_OFFER_NAME = 'get_ai_line_offer';

export const getAiLineOfferDescription =
  'The current offer for real US phone lines for AI agents: monthly price per number for texts, and with voice over ' +
  'SIP; the first-term minimum; what a line includes (a real US mobile number on a national carrier, inbound texts to ' +
  'a webhook or over the API, voice over SIP with the number as caller ID, one call at a time, outbound calls to US ' +
  'numbers only); delivery time; payment methods; how many numbers are ready in stock right now; and the links to ' +
  'apply and to the API docs. Use this first when someone is building a voice agent, a phone assistant, a companion ' +
  'app or SMS customer service and asks what a line costs or how to get one. Takes no input. This connector cannot ' +
  'open an account or buy a line: send the user to apply_url.';

export const getAiLineOfferInput = {};

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
  ready_now: z.object({ texts: z.number().int(), voice: z.number().int() }).nullable(),
  apply_url: z.string(),
  docs_url: z.string(),
  how_to_get_one: z.string(),
};

export function makeGetAiLineOfferHandler(cfg: Config) {
  return async (_args: Record<string, never>) => {
    const d: any = await callBackend(cfg, { method: 'GET', path: '/web/ai-lines/offer' });
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const ready = d?.ready_now && typeof d.ready_now === 'object'
      ? { texts: Math.max(0, Math.trunc(num(d.ready_now.texts))), voice: Math.max(0, Math.trunc(num(d.ready_now.voice))) }
      : null;
    const result = {
      product: String(d?.product || 'Real US phone lines for AI agents'),
      currency: String(d?.currency || 'USD'),
      monthly: {
        texts_usd: num(d?.monthly?.texts_usd),
        voice_usd: num(d?.monthly?.voice_usd),
        note: String(d?.monthly?.note || 'Per number, per month. Usage is billed separately.'),
      },
      usage_billed_separately: d?.usage_billed_separately !== false,
      min_months: Math.max(1, Math.trunc(num(d?.min_months)) || 1),
      term_note: String(d?.term_note || ''),
      includes: Array.isArray(d?.includes) ? d.includes.map((x: unknown) => String(x)) : [],
      delivery: {
        from_stock: String(d?.delivery?.from_stock || ''),
        new_number: String(d?.delivery?.new_number || ''),
        account: String(d?.delivery?.account || ''),
      },
      payment_methods: Array.isArray(d?.payment_methods) ? d.payment_methods.map((x: unknown) => String(x)) : [],
      ready_now: ready,
      apply_url: String(d?.apply_url || 'https://www.meisimusa.com/api-for-ai-agents.html'),
      docs_url: String(d?.docs_url || 'https://www.meisimusa.com/api-docs.html'),
      how_to_get_one:
        'Apply at apply_url (a person approves the account, usually the same day), then order numbers by API or from ' +
        'the dashboard. This connector only reads the offer; it cannot open an account or buy a line.',
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
  };
}
