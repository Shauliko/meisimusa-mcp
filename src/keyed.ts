// The tools that work on YOUR numbers need a MeiSIM API key. The key is the
// account: it says which numbers are yours, whose wallet pays, and what the
// account is allowed to do (sending, voice, a daily spending limit). Keys are
// issued by a person after an application; there is no self-serve signup.
//
// Remote (https://mcp.meisimusa.com/mcp): send the key on every request as
//   Authorization: Bearer <key>   or   x-dealer-key: <key>
// Local (npx meisimusa-mcp): MEISIMUSA_API_KEY in the env.

import type { Config } from './config.js';
import { ToolError } from './errors.js';

export const APPLY_URL = 'https://www.meisimusa.com/wholesale.html#apply';

export function requireKey(cfg: Config): void {
  if (cfg.mock || cfg.apiKey) return;
  throw new ToolError(
    'unauthorized',
    'This tool needs a MeiSIM API key. Remote: send it as "Authorization: Bearer <key>" on the connection. ' +
      'Local: set MEISIMUSA_API_KEY. No key yet? Apply at ' + APPLY_URL + ' and a person approves the account.',
    { status: 401 },
  );
}

/** A 10-digit US number from whatever the model typed: "+1 (423) 432-2309" → "4234322309". */
export function usNumber10(s: unknown): string {
  const d = String(s ?? '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/** A line as the API returns it, reduced to what an agent needs. */
export function publicNumber(l: any) {
  return {
    number: String(l.number || ''),
    e164: String(l.e164 || ('+1' + l.number)),
    label: l.label ?? null,
    status: String(l.status || 'unknown'),
    voice: l.voice === true,
    billing: l.billing === 'daily' ? 'daily' : 'monthly',
    paid_through: l.billing === 'daily' ? (l.daily_paid_through ?? null) : (l.expires_at ? String(l.expires_at).slice(0, 10) : null),
    auto_renew: l.auto_renew === true,
    stops_at_local: l.cancels_at_local ?? null,
    billing_note: l.renews ?? null,
    order_id: l.order_id ?? null,
    customer_reference: l.customer_reference ?? null,
    last_message_at: l.last_sms_at ?? null,
  };
}

export function publicMessage(m: any) {
  return {
    id: String(m.id ?? ''),
    number: String(m.to ?? ''),
    from: String(m.from ?? ''),
    text: String(m.text ?? m.body ?? ''),
    received_at: m.received_at ?? null,
  };
}

export function publicOrder(o: any) {
  return {
    order_id: String(o.order_id ?? o.id ?? ''),
    customer_reference: o.customer_reference ?? null,
    status: String(o.status ?? 'unknown'),
    ordered: Number(o.ordered ?? 0),
    delivered: Number(o.delivered ?? 0),
    outstanding: Number(o.outstanding ?? 0),
    numbers: Array.isArray(o.numbers) ? o.numbers.map(String) : [],
    billing: o.billing === 'daily' ? 'daily' : 'monthly',
    voice: o.voice === true,
    days_paid: o.days_paid ?? null,
    charged_usd: o.charged_usd ?? null,
    refunded_usd: o.refunded_usd ?? 0,
    created_at: o.created_at ?? null,
    completed_at: o.completed_at ?? null,
  };
}

export const text = (result: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  structuredContent: result,
});
