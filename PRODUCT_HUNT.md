# Product Hunt launch kit — MeiSIM

Distribute it as what it is: a connector you plug into your AI assistant. No commerce review involved — users add the URL (or `npx`) and get the full buy-in-chat flow on ChatGPT, Claude, and Grok.

## Name
MeiSIM — Travel eSIMs in your AI chat

## Tagline (≤60 chars)
Buy a travel data eSIM inside ChatGPT, Claude & Grok

## Topics / categories
Artificial Intelligence · Travel · Developer Tools · SaaS · API

## Description (the listing body)
MeiSIM turns your AI assistant into a travel-eSIM store. Add the connector once, then just say "I'm going to Italy for 10 days, get me 5GB" — your assistant searches plans across 190+ countries, shows USD prices, and gives you a secure payment link. You pay with your own card, and the eSIM QR is emailed the moment payment clears. Install in minutes, keep your home number on your physical SIM. No app to download, no account to create. Works in ChatGPT, Claude, and Grok through the open Model Context Protocol — and it's open source.

## Maker's first comment
Hey hunters — I run a travel eSIM shop, and a customer told me they wished they could just buy data "without leaving the chat." So I wrapped our existing API in a small open-source MCP server. Four tools — search, quote, buy (Stripe link), and fetch the install QR. The whole thing is ~600 lines of TypeScript; the assistant does the conversation, my backend does the commerce, and you pay on a normal Stripe page. It runs on any MCP-compatible assistant (ChatGPT, Claude, Grok). Would love feedback on the flow and what country/feature to add next.

## How to connect (put this front and center — it's the CTA)
- **Claude / Grok / ChatGPT (custom connector):** add this URL as a custom connector — `https://mcp.meisimusa.com/mcp`
- **Desktop / IDE (Cursor, Zed):** `npx -y meisimusa-mcp`
- Then ask: *"Find me eSIM plans for Italy, 10 days."*

## Gallery (4–5 images to upload)
1. The plan list rendered in Claude after the Italy prompt.
2. A quote for one plan.
3. The purchase response with the payment link.
4. The QR code rendered in-chat.
5. A simple "Add connector → ask → get eSIM" 3-step graphic.
(Plus your 美 logo as the thumbnail.)

## Links
- Website: https://www.meisimusa.com
- GitHub: https://github.com/<you>/meisimusa-mcp
- npm: https://www.npmjs.com/package/meisimusa-mcp

## Launch-day tips
- Post at 12:01 AM PT (Product Hunt's day starts then) for a full day of votes.
- Line up your first comment and a few friends to try the connector and comment early.
- Reply to every comment for the first 24h.
- Cross-post the dev.to build story (`LAUNCH_POST.md`) and link it in a comment.
