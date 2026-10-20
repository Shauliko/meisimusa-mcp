# meisimusa-mcp

The MCP (Model Context Protocol) server for [MeiSIM USA](https://www.meisimusa.com). Two things in one server:

1. **Real US phone numbers for your AI agent** (API key). List the numbers on your account, read the texts they receive, wait for the next one, send texts, check the wallet and buy more numbers. The numbers are real carrier lines, not virtual numbers.
2. **Travel eSIMs and retail US plans** (no key). Search plans for about 200 countries, get a quote, pay by card on a Stripe page, get the install QR, top up a line.

> "Which of my numbers got a text in the last hour?" → `read_messages`
> "Wait for the confirmation text on 423 432 2309 and read it back" → `wait_for_message`
> "Text +1 212 555 0100 from my number: running ten minutes late" → `send_message`
> "I'm going to Italy for 10 days, get me 5GB" → `search_plans`, `purchase`, `get_activation`

## Connect

**Remote, nothing to install.** Add `https://mcp.meisimusa.com/mcp` as a custom connector or HTTP MCP server. For the tools on your own numbers, send your API key on the connection:

```bash
# Claude Code
claude mcp add --transport http meisim https://mcp.meisimusa.com/mcp --header "Authorization: Bearer YOUR_KEY"
```

```jsonc
// Cursor, Windsurf and other clients with an mcp.json
{
  "mcpServers": {
    "meisim": {
      "type": "http",
      "url": "https://mcp.meisimusa.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_KEY" }
    }
  }
}
```

Without a key the retail tools still work and the number tools answer with where to apply.

**Local (stdio), for Claude Desktop, Cursor, Zed:**

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "meisimusa": {
      "command": "npx",
      "args": ["-y", "meisimusa-mcp"],
      "env": { "MEISIMUSA_API_KEY": "YOUR_KEY" }
    }
  }
}
```

**Get an API key.** Apply at https://www.meisimusa.com/wholesale.html#apply. A person reviews every application and approves the account; there is no self-serve signup. Keys are the account: they say which numbers are yours, whose prepaid wallet pays, and what the account may do (sending, voice, a daily spending limit).

## Tools

### Your numbers (API key)

| Tool | What it does | Wraps |
|---|---|---|
| `get_account` | Company, status, wallet balance, how many numbers you may still activate today | `GET /api/v1/me`, `GET /dealer/wallet` |
| `get_number_pricing` | What a new number costs on your account, daily or monthly, with or without voice | `GET /dealer/sms-lines/offer` |
| `buy_numbers` | Order numbers from the prepaid wallet; prepaid, no returns; `customer_reference` makes a retry safe | `POST /api/v1/sms/order` |
| `get_order` | Status of an order, the numbers delivered so far, what was charged | `GET /api/v1/sms/orders/:id` |
| `list_my_numbers` | Your numbers, paged, with billing and the date each is paid through | `GET /api/v1/sms/lines` |
| `read_messages` | Texts received, newest first; filter by number and `since` | `GET /api/v1/sms/messages` |
| `wait_for_message` | Block up to 50 s for the next text on a number, then return it | polls the same |
| `send_message` | A text from one of your numbers (sending is enabled per account) | `POST /api/v1/sms/lines/:number/send` |

Money rules the server enforces by design: `buy_numbers` always sends a `customer_reference` (yours or a generated one) and the backend treats it as an idempotency key, so an AI retry cannot order twice. The account's daily spending limit and wallet balance are enforced server-side and come back as structured errors (`payment_required`, `rate_limited`), never retried silently. The agent cannot add money to the wallet.

Voice: a number bought with `voice: true` also takes and makes calls over SIP. The SIP login is shown on your MeiSIM dashboard, not through this server.

### Retail (no key)

| Tool | What it does | Wraps |
|---|---|---|
| `search_plans` | Travel eSIM plans for a country, USD | `GET /mm/products?country=` |
| `get_quote` | Price breakdown for one plan | `GET /mm/products/:id` |
| `search_us_numbers` | Retail US phone plans (a line on a phone, paid by card) | `GET /mm/products?country=US` |
| `purchase` | A Stripe payment link; the eSIM is emailed when paid | `POST /web/checkout` |
| `get_activation` | Order status and the install QR | `GET /web/order/:id` |
| `topup_lookup`, `topup_start` | Refill an existing US line | `/web/topup/*` |

The customer pays their own card on Stripe's hosted page; the server never sees card data. Every purchase carries an idempotency key.

### Claude Connectors Directory build (`/mcp-directory`)

`https://mcp.meisimusa.com/mcp-directory` is the listing in the Claude Connectors Directory. It needs no login and exposes only public, read-only data, AI phone lines first:

| Tool | What it does | Wraps |
|---|---|---|
| `get_ai_line_offer` | The live offer for US phone lines for AI agents: monthly prices (texts, and with voice over SIP), first-term minimum, what a line includes, delivery, payment methods, numbers ready now, apply + docs links | `GET /web/ai-lines/offer` (public; reads the backend's own settings, so no copy of a price lives in this server) |
| `search_us_numbers` | Retail US phone plans for a handset, each with a `buy_url` | `GET /mm/products?country=US` |
| `search_plans` | Travel eSIM plans for a country, each with a `buy_url` | `GET /mm/products?country=` |
| `get_quote` | Price breakdown for one plan plus its `buy_url` | `GET /mm/products/:id` |

How it works, example prompts, limits, troubleshooting and what is logged: [meisimusa.com/claude-connector.html](https://www.meisimusa.com/claude-connector.html). `search_plans` and `search_us_numbers` take `limit` (default 10, max 50) and return `currency` once at the top level; `get_quote` takes an optional `country_code` to label a regional plan. The server also answers `/` (a one-page front door), `/favicon.ico` and `/apple-touch-icon.png` (the connector icon).

Nothing on that path opens an account, buys, tops up, texts, or reads an account, and any key sent with the request is ignored. Someone who wants a line goes to `apply_url`; someone who wants a plan opens its `buy_url`, which shows that exact plan on meisimusa.com (`plans.html?buy=<plan_id>`), where they pay by card. `/mcp` (full) and `/mcp-info` (ChatGPT) are unchanged. Locally: `--directory` / `MEISIMUSA_DIRECTORY=1`.

## Configure

| Env var | Default | Purpose |
|---|---|---|
| `MEISIMUSA_API_KEY` | none | Your API key (local stdio server). The remote server takes it per request from `Authorization: Bearer`, `x-dealer-key` or `x-api-key` and ignores this variable. |
| `MEISIMUSA_API_BASE` | `https://meisimusa-backend.vercel.app` | Backend base URL. |
| `MEISIMUSA_TIMEOUT_MS` | `20000` | Per-request timeout. |
| `--mock` / `MEISIMUSA_MOCK=1` | off | Deterministic in-memory data, no network. |
| `--info-only` / `MEISIMUSA_INFO_ONLY=1` | off | Only the retail discovery tools (the ChatGPT directory build). Remote: `/mcp-info`. |
| `--directory` / `MEISIMUSA_DIRECTORY=1` | off | The Claude Connectors Directory build: get_ai_line_offer plus the three catalog tools with a `buy_url` per plan. Remote: `/mcp-directory` (`MCP_DIRECTORY_PATH`). |
| `MEISIMUSA_SITE_URL` | `https://www.meisimusa.com` | Website used for `buy_url`. |
| `PORT` / `MCP_PATH` | `8787` / `/mcp` | Remote HTTP server only. |

## Develop

```bash
npm install
npm run dev -- --mock     # stdio server on mock data
npm run start:http        # remote Streamable HTTP server
npm test                  # vitest: every tool, happy and error paths, against the mock
npm run build             # dist/ (enables npx + node dist/http-server.js)
```

## Security

- API keys, payment tokens and QR/LPA strings are never logged; identifiers are masked to first-4 + last-4.
- The remote server never holds a key of its own; each request carries its caller's.
- A backend `429` is surfaced as `rate_limited` with `retry_after_seconds`; a `402` as `payment_required`.
- Messages are returned as received. The server parses nothing out of them.
