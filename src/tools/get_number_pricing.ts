// Tool: get_number_pricing. What a number costs on THIS account, both ways of
// paying, and whether ordering is open. Wraps GET /dealer/sms-lines/offer.
// Prices differ per account, so this is read, never hard-coded.

import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { requireKey, text } from '../keyed.js';

export const GET_NUMBER_PRICING_NAME = 'get_number_pricing';

export const getNumberPricingDescription =
  'Show what a new US number costs on your MeiSIM account and whether you can order: the daily rate (minimum days, ' +
  'one-time activation fee, how many are ready right now) and the monthly rate (first month, renewals, minimum months), ' +
  'with and without voice. Call before buy_numbers. Needs your API key.';

export const getNumberPricingInput = {};

export function makeGetNumberPricingHandler(cfg: Config) {
  return async () => {
    requireKey(cfg);
    const d: any = await callBackend(cfg, { method: 'GET', path: '/dealer/sms-lines/offer' });
    if (!d?.enabled || !d?.can_order) {
      return text({ can_order: false, reason: d?.reason || 'Ordering is not open on this account yet.', currency: 'USD' });
    }
    const daily = d.daily || {};
    const voice = d.voice || {};
    return text({
      can_order: true,
      currency: 'USD',
      monthly: {
        first_month_usd: d.first_month_usd ?? d.price_per_line_usd ?? null,
        renew_price_usd: d.renew_price_usd ?? null,
        min_months: d.min_months ?? 2,
        voice_price_usd: voice.available ? (voice.price_usd ?? null) : null,
      },
      daily: {
        available: daily.available === true,
        price_usd: daily.price_usd ?? null,
        voice_price_usd: daily.voice_price_usd ?? null,
        min_days: daily.min_days ?? null,
        activation_fee_usd: daily.activation_fee_usd ?? null,
        voice_activation_fee_usd: daily.voice_activation_fee_usd ?? null,
        ready_now: daily.ready_now ?? null,
        note: daily.note ?? null,
      },
      voice_available: voice.available === true,
      voice_note: voice.note ?? null,
    });
  };
}
