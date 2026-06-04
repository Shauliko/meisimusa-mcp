# Phase 2 — Wire to Claude Desktop & test

The npm package isn't published yet (that's Phase 3), so for testing we point Claude at your **local build**. First time, run it in **`--mock`** mode so you can verify the whole flow renders in Claude with **zero charges and no API key**. Then switch to the real shared key.

## 0. Build it once

```bash
cd mcp-esim
npm install
npm run build      # produces dist/  (dist/cli.js is the entry)
npm test           # optional: green check on all tools
```

## 1. Add to claude_desktop_config.json

Config file location:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

### First run — MOCK (safe, no key, no charges)

```jsonc
{
  "mcpServers": {
    "meisimusa": {
      "command": "node",
      "args": ["C:\\dev\\MeiSim\\meisimusa\\mcp-esim\\dist\\cli.js", "--mock"]
    }
  }
}
```

(macOS/Linux: use the absolute POSIX path, e.g. `/Users/you/.../mcp-esim/dist/cli.js`.)

### Real run — your shared dealer key

```jsonc
{
  "mcpServers": {
    "meisimusa": {
      "command": "node",
      "args": ["C:\\dev\\MeiSim\\meisimusa\\mcp-esim\\dist\\cli.js"],
      "env": {
        "MEISIMUSA_API_KEY": "dk_your_shared_dealer_key"
      }
    }
  }
}
```

`MEISIMUSA_PRICE_CURRENCY` is optional (defaults to `GBP`). **Fully restart Claude Desktop** after editing (quit, not just close the window). The four tools — `search_plans`, `get_quote`, `purchase`, `get_activation` — should appear in the tool list.

> Once published (Phase 3), this collapses to `"command": "npx", "args": ["-y", "meisimusa-mcp"]`.

## 2. The test walkthrough (mock mode)

1. **You:** "Find me eSIM plans for Italy, 10 days."
   - Claude calls `search_plans { country_code: "IT", duration_days: 10 }`.
   - Expect 3 plans (the 7-day plan is filtered out), cheapest first: `esim_IT_5gb_30d` @ 6.30 GBP.
2. **You:** "Quote the cheapest one."
   - Claude calls `get_quote { plan_id: "esim_IT_5gb_30d", country_code: "IT" }` → final 6.30 GBP, 15-minute quote.
3. **You:** "Buy it, send it to traveler@example.com."
   - Claude calls `purchase { plan_id: "esim_IT_5gb_30d", customer_email: "traveler@example.com" }` → `status: completed`, an `order_id` (the ICCID).
   - If Claude retries (network blip), the same `idempotency_key` returns the same order — no double charge.
4. **You:** "Show me the activation QR."
   - Claude calls `get_activation { order_id: <that id> }` → `status: ready`, `activation_code`, install steps. In mock the QR is an LPA string (no image); against the **real** backend a base64 PNG renders inline as a scannable QR.

When this reads clean in mock, swap in the real key and repeat with a genuine country. **Remember the real `purchase` bills your wallet** — do one deliberately.

## 3. Five failure modes (what triggers them, what you see)

| # | Failure | How it surfaces |
|---|---------|-----------------|
| 1 | **Invalid country code** | Malformed (e.g. "Italy", "ITA") → Zod rejects before any call: `invalid_input`. Valid but unsupported ISO (e.g. "ZZ") → empty `plans: []`, `total_results: 0` (not an error). |
| 2 | **Expired / bad payment** | N/A in the wallet model — `payment_method` is ignored. The real-world equivalent is an **insufficient wallet balance**: backend returns `402` → tool error `payment_required`. Top up the dealer wallet and retry. |
| 3 | **Plan out of stock** | `purchase` gets a non-success from the order endpoint → returns `{ status: "failed", error: "<upstream reason>" }` (and `isError`). No wallet artifact is cached, so a retry is clean. |
| 4 | **Network failure mid-purchase** | `http.ts` aborts on timeout/connection drop → `network_error`. The `idempotency_key` (sent as `customerReference`) is the guard: a same-key retry returns the first order if it had landed. Durable cross-process dedupe is a backend item. |
| 5 | **QR fetched before ready** | `get_activation` on an order still provisioning → `status: "pending"`, `qr_code_png_base64: null`. Poll again in a few seconds; it flips to `ready` once the profile is live. |

Rate limiting (`429`) is handled everywhere: tools return `rate_limited` with `retry_after_seconds` and never silently retry.

## 4. 90-second screencast script

> Goal: show a real business added to Claude with no plugins, no dashboard — just chat.

- **0:00–0:10** — Title card: "Buying a travel eSIM inside Claude." Cut to Claude Desktop, tool list open showing the four `meisimusa` tools.
- **0:10–0:30** — Type: *"I'm going to Italy for 10 days, find me a data plan with at least 5GB."* Show `search_plans` running and the plan list appearing. Hover the cheapest.
- **0:30–0:50** — Type: *"Quote the cheapest and buy it for traveler@example.com."* Show `get_quote` then `purchase` firing; highlight the returned `order_id` and `status: completed`.
- **0:50–1:10** — Type: *"Show me the QR to install it."* Show `get_activation` and the **QR image rendering inline**. Pan a phone camera at the screen to imply the scan.
- **1:10–1:25** — Voiceover: "No app, no checkout page. The eSIM business runs through one MCP server — about 600 lines of TypeScript." Show the `mcp-esim/src` tree briefly.
- **1:25–1:30** — End card: `npx meisimusa-mcp` + the docs URL.

Record the **mock** run for a clean, repeatable take (deterministic data, no spend); only the QR image differs from production.
