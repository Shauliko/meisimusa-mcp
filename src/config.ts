// Central config. Read once at startup from env + argv.
//
// The consumer flow (search / quote / purchase / activation) runs entirely on
// MeiSIM's PUBLIC retail endpoints — no API key required, prices in USD, and
// the customer pays their own card on Stripe's hosted page. MEISIMUSA_API_KEY
// is therefore OPTIONAL; it is only sent (as x-dealer-key) if you point the
// server at the B2B dealer endpoints. It is never logged in full.

export interface Config {
  baseUrl: string;
  apiKey: string | undefined;
  priceCurrency: string; // retail catalog is USD
  mock: boolean;
  timeoutMs: number;
  version: string;
  // Info-only mode registers ONLY search_plans + get_quote (no purchase /
  // get_activation). Required for ChatGPT, whose app commerce is physical-goods
  // only — an eSIM is a digital good, so the in-chat purchase flow can't ship
  // there. Claude / Grok / direct users get the full server.
  infoOnly: boolean;
}

export const VERSION = '0.1.6';

export function loadConfig(argv: string[] = process.argv.slice(2)): Config {
  const mock =
    argv.includes('--mock') ||
    process.env.MEISIMUSA_MOCK === '1' ||
    process.env.MEISIMUSA_MOCK === 'true';

  return {
    baseUrl: (process.env.MEISIMUSA_API_BASE || 'https://meisimusa-backend.vercel.app').replace(/\/$/, ''),
    apiKey: process.env.MEISIMUSA_API_KEY,
    priceCurrency: (process.env.MEISIMUSA_PRICE_CURRENCY || 'USD').toUpperCase(),
    mock,
    timeoutMs: Number(process.env.MEISIMUSA_TIMEOUT_MS || 20000),
    version: VERSION,
    infoOnly: argv.includes('--info-only') || process.env.MEISIMUSA_INFO_ONLY === '1',
  };
}
