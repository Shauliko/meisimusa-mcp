// Central config. Read once at startup from env + argv.
//
// The retail flow (search / quote / purchase / activation) runs on MeiSIM's
// PUBLIC endpoints: no API key, prices in USD, the customer pays their own card
// on Stripe's hosted page. The tools on YOUR numbers (list, read, wait, send,
// buy, account) need an API key: MEISIMUSA_API_KEY for the local stdio server,
// or a per-request header on the remote server (see http-server.ts). Never
// logged in full.

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
  // Directory mode (the Claude Connectors Directory build, remote path
  // /mcp-directory): the same three public, read-only catalog tools as
  // info-only, but every plan carries a buy_url on meisimusa.com and the tool
  // text sends the user there to pay. No purchase, top-up, messaging or
  // account tool is registered, and no key is read: the directory policy bars
  // connectors that execute financial transactions for the user.
  directory?: boolean;
  // Public website, for the buy links. Never the API host.
  siteUrl: string;
}

export const VERSION = '0.3.0';

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
    directory: argv.includes('--directory') || process.env.MEISIMUSA_DIRECTORY === '1',
    siteUrl: (process.env.MEISIMUSA_SITE_URL || 'https://www.meisimusa.com').replace(/\/$/, ''),
  };
}
