// Tool: get_account. Who the key belongs to, the wallet balance, and the
// day's activation ceiling. Wraps GET /api/v1/me + GET /dealer/wallet.

import type { Config } from '../config.js';
import { callBackend } from '../http.js';
import { requireKey, text } from '../keyed.js';

export const GET_ACCOUNT_NAME = 'get_account';

export const getAccountDescription =
  'Show the MeiSIM account behind your API key: company, status, prepaid wallet balance in USD, and how many new ' +
  'numbers you may still activate today. Use before buy_numbers, or when the user asks what is left. Needs your API key.';

export const getAccountInput = {};

export function makeGetAccountHandler(cfg: Config) {
  return async () => {
    requireKey(cfg);
    const [me, wallet]: any[] = await Promise.all([
      callBackend(cfg, { method: 'GET', path: '/api/v1/me' }),
      callBackend(cfg, { method: 'GET', path: '/dealer/wallet' }),
    ]);
    return text({
      company: me?.company_name ?? wallet?.company ?? null,
      email: me?.email ?? null,
      status: me?.status ?? null,
      balance_usd: Number(wallet?.balance ?? 0),
      currency: 'USD',
      daily_line_limit: me?.daily_line_limit ?? null,
      lines_remaining_today: me?.lines_remaining_today ?? null,
      topup_note: 'Top up the wallet on the MeiSIM dashboard; the agent cannot add money.',
    });
  };
}
