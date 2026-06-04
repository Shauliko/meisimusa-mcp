# meisimusa-mcp

An MCP (Model Context Protocol) server that lets AI assistants — Claude (web, desktop, mobile), ChatGPT, Perplexity, Cursor, Zed — **search and buy travel eSIMs** from [MeiSIM USA](https://www.meisimusa.com) in natural language.

> "I'm going to Italy for 10 days, get me 5GB" → the assistant searches plans, returns a Stripe payment link, and once the customer pays, hands back the install QR — all in the chat.

It's a **thin wrapper** over MeiSIM's existing **public** REST API (`/mm/products`, `/web/checkout`, `/web/order/:id`). No business logic, no database, **no API key required** — the customer pays their own card on Stripe's hosted page.

## Tools

| Tool | Wraps | Notes |
|------|-------|-------|
| `search_plans` | `GET /mm/products?country=` | USD prices, returns `plan_id` |
| `get_quote` | `GET /mm/products/:id` | price breakdown + short quote |
| `purchase` | `POST /web/checkout` | returns a **Stripe payment link**; in-process idempotency |
| `get_activation` | `GET /web/order/:id` | status + QR (rendered as an image when ready) |

## Two ways to run it

**Remote (reaches everyone, no install)** — host the Streamable HTTP endpoint and add it as a custom connector. Works on claude.ai web, Claude mobile, ChatGPT, Perplexity. See `PHASE3_DISTRIBUTION.md` step 3.

```
https://mcp.meisimusa.com/mcp
```

**Local (desktop/IDE)** — Claude Desktop, Cursor, Zed via the npm package:

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "meisimusa": {
      "command": "npx",
      "args": ["-y", "meisimusa-mcp"]
    }
  }
}
```

No `env` block needed for the consumer flow. (See `PHASE2_TESTING.md` for testing against a local build first.)

## Configure (all optional)

| Env var | Default | Purpose |
|---|---|---|
| `MEISIMUSA_API_KEY` | — | **Optional.** Dealer key (`x-dealer-key`), only for the B2B dealer endpoints. Never logged in full. |
| `MEISIMUSA_API_BASE` | `https://meisimusa-backend.vercel.app` | Backend base URL. |
| `MEISIMUSA_PRICE_CURRENCY` | `USD` | Currency label (retail catalog is USD). |
| `MEISIMUSA_TIMEOUT_MS` | `20000` | Per-request timeout. |
| `--mock` / `MEISIMUSA_MOCK=1` | off | Serve deterministic in-memory data; no network. |
| `PORT` / `MCP_PATH` | `8787` / `/mcp` | Remote HTTP server only. |

## Develop

```bash
npm install
npm run dev -- --mock     # stdio server on mock data
npm run start:http        # remote Streamable HTTP server (also honours --mock via env)
npm test                  # vitest: all four tools, happy + error paths
npm run build             # → dist/  (enables npx + node dist/http-server.js)
```

## Payment & idempotency

`purchase` returns a hosted Stripe checkout URL; the customer pays with their own card and MeiSIM's existing webhook provisions + emails the QR. The buyer pays, you don't front cost, and the AI never sees card data. Every purchase carries an `idempotency_key` (auto-generated if absent); a repeat with the same key returns the first checkout instead of opening a second — so an AI retry can't double-charge.

## Security

- API keys, tokens, and QR/LPA strings are never logged — identifiers masked to first-4 + last-4.
- Backend `429` is surfaced as a structured error with `retry_after_seconds`; never retried silently.

## Remaining backend items (small)

The public retail path resolved the earlier gaps (USD retail pricing, card payment, QR delivery, order_id-keyed activation are all handled by existing endpoints). What's left:

1. **Durable idempotency.** The in-process key guard covers AI retries within a session; cross-process/replicated dedupe would need the backend to treat the key (sent as the order reference) as a true idempotency key.
2. **QR as PNG.** `get_activation` renders an image when the order carries a base64 PNG; if your order stores only the LPA string, it surfaces as `activation_code` (still installable). Optional: have the order store a PNG too.

A separate **B2B dealer path** (wallet-billed, `x-dealer-key`, `/api/v1/esim/*`) also exists if you want resellers to buy against a prepaid balance instead of per-card.
