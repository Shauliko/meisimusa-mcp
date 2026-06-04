# Getting MeiSIM into the AI app stores

This is the "app store" play: instead of asking people to paste a connector URL, you get **listed** in the ChatGPT App Directory and the Claude Connectors Directory, where users discover and one-click-add your app — and the assistant can suggest it in relevant conversations. Both run on the remote MCP server you already deployed (`https://mcp.meisimusa.com/mcp`). Below is all the copy drafted for you, plus the exact submission process for each.

---

## Part 1 — The listing content (use for both stores)

**App name (≤30 chars):** `MeiSIM Travel eSIM`

**One-line / short description (≤ ~80 chars):**
Buy travel data eSIMs for 190+ countries without leaving the chat.

**Long description:**
MeiSIM lets travelers find and buy a data eSIM right inside the conversation. Tell it where you're going and for how long ("5GB in Italy for 10 days") and it returns matching plans with prices in USD, gives a clean quote, and hands back a secure payment link. You pay with your own card on a hosted checkout page, and the eSIM QR code is emailed the moment payment clears — install it in about five minutes, keep your home number on your physical SIM. Coverage spans 190+ countries with regional and global options. No app to download, no account to create.

**Category:** Travel (secondary: Shopping / Utilities)

**Developer / publisher name:** MeiSIM USA

**Verified website:** https://www.meisimusa.com

**Privacy policy URL:** https://www.meisimusa.com/privacy.html  *(confirm this resolves; if not, tell me and I'll draft one)*
**Terms URL:** https://www.meisimusa.com/terms.html  *(same — confirm or I'll draft)*

**Support contact:** support@meisimusa.com

**The tools the reviewer will see** (already defined in the MCP server, no action needed):
`search_plans`, `get_quote`, `purchase`, `get_activation` — each with a plain-English description and Zod-validated inputs.

### Icon (64×64 px, PNG, under 5 KB)
Simple, legible at tiny size. Suggested: a white globe or SIM-card silhouette on your brand red (#E8352A) rounded square, no text. If you don't have one, send me your logo and I'll produce a compliant 64×64. Also prepare a larger version (512×512) — some surfaces ask for it.

### Screenshots to capture (3–4, from the live connector in Claude/ChatGPT)
1. The plan list after "Find me eSIM plans for Italy, 10 days."
2. A quote for one plan.
3. The purchase response with the payment link.
4. The activation showing the QR image.
Capture them clean (no personal data in view).

---

## Part 2 — ChatGPT App Directory

1. **Verify your identity.** In the OpenAI Platform dashboard, complete **business verification** (to publish as "MeiSIM USA") — this is required before an app can go live and only you can do it.
2. **Create the app** in the Apps SDK / developer console, pointing it at your MCP server: `https://mcp.meisimusa.com/mcp`.
3. **Fill the metadata** from Part 1 (name, descriptions, icon, screenshots, privacy/terms, website, category).
4. **Submit for review.** OpenAI reviews for policy + quality (working tools, accurate descriptions, no broken flows — which is why we cleaned the catalog first). Approved apps roll out to users in the directory at chatgpt.com/apps and the tools menu.
5. Optional later: add rich **Apps SDK UI components** (e.g. a visual plan picker). The tool-only MCP qualifies as-is; UI is an enhancement.

---

## Part 3 — Claude Connectors Directory

1. **Confirm the server meets the review bar.** The directory wants vetted, "helpful and harmless" MCP servers: stable HTTPS endpoint (done), accurate tool descriptions (done), sensible error handling and no secret logging (done). Adding tool **annotations** (read-only vs write hints) helps — `search_plans`/`get_quote`/`get_activation` are read-only; `purchase` is a write/action. I can add those annotations to the server if you want a cleaner review.
2. **Submit** via Anthropic's connector submission form (claude.com/docs/connectors/building/submission) with the Part 1 content + the endpoint `https://mcp.meisimusa.com/mcp`.
3. On approval it appears in the claude.ai Connectors Directory, where users discover and add it in one click.

---

## Part 3.5 — Smithery + registry (developer reach, quick)

- **Smithery.ai:** Add server → connect the GitHub repo (`smithery.yaml` is ready).
- **Official MCP registry / servers list:** publish `server.json` via the `mcp-publisher` CLI + a one-line PR to `modelcontextprotocol/servers`.

---

## Review-readiness checklist (all green except where noted)

- [x] Public HTTPS MCP endpoint live (`/mcp`) + `/health`
- [x] Accurate, plain-English tool descriptions
- [x] No API keys / tokens / QR strings logged
- [x] Graceful 429 handling with retry_after; structured errors
- [x] Catalog cleaned: test plans removed, durations in days, no below-cost plans
- [ ] Privacy policy + terms URLs resolve (confirm or I draft)
- [ ] Icon 64×64 <5KB (send logo or I generate)
- [ ] Identity/business verification (only you can do this)

---

## The realistic picture

You will not get auto-installed onto a billion accounts — no platform does that. But the directory model is the closest thing: once listed, users **discover** you, add you in one click, and the assistant can **surface** your app contextually when someone asks about travel data. Combine that with the GEO/Bing work (so when people ask *without* your app, the assistant still cites meisimusa.com) and you have both the transactional path (app) and the organic path (citations). The directory submissions are review-gated, so expect a back-and-forth and a few days to weeks per platform.
