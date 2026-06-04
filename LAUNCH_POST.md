---
title: "Adding your existing business to Claude in an afternoon"
published: false
tags: mcp, ai, typescript, indiehackers
---

Last week a customer told me they wished they could just buy an eSIM "without leaving the chat." That sentence turned into an afternoon of work and a small open-source package. Here is exactly how I put a real, revenue-generating business inside Claude, ChatGPT, and every other assistant that speaks MCP, without rebuilding anything.

## The idea

I run a travel eSIM shop. The whole purchase already exists as a public REST API: list plans for a country, look up a plan, create a Stripe checkout, fetch an order's QR. The Model Context Protocol (MCP) is just a thin, typed way to hand those four actions to an AI as "tools." So the job was not to build commerce. It was to wrap four endpoints I already had.

## Four tools, no business logic

The rule I set for myself: the MCP layer holds zero business logic. Every tool is a thin wrapper. If an endpoint did not exist, I would add it to the backend, not fake it in the wrapper.

- `search_plans(country_code, duration_days, data_gb?)` → wraps `GET /products?country=`.
- `get_quote(plan_id)` → wraps `GET /products/:id`.
- `purchase(plan_id, customer_email)` → wraps the checkout endpoint and returns a hosted Stripe payment link.
- `get_activation(order_id)` → wraps the order-status endpoint and returns the install QR as an image.

Each tool is a Zod schema plus about twenty lines that call one endpoint and reshape the response. The official `@modelcontextprotocol/sdk` does the protocol plumbing.

## The two details that matter

**Payment.** The trick that makes "buy in chat" honest is that `purchase` does not take a card. It returns a Stripe checkout URL. The customer pays on Stripe's own page with their own card, and my existing webhook provisions the eSIM and emails the QR. The AI never touches payment details, and I never front the cost.

**Idempotency.** AI agents retry. Without a guard, a retry is a double charge. Every purchase carries an idempotency key (generated if the caller omits it); a repeat with the same key returns the first order instead of starting a second checkout. This one rule is the difference between a toy and something you let strangers use.

## Reaching everyone, not just one app

A local `npx` server works in Claude Desktop, Cursor, and Zed, but it needs an install. The reach comes from a remote endpoint over Streamable HTTP (the current standard transport; SSE is on the way out). One public URL is reachable from claude.ai on the web, Claude mobile, ChatGPT, and Perplexity, with no install at all. Same four tools, two delivery methods.

## Safety basics

API keys, tokens, and QR strings are never logged; identifiers are masked to first-four and last-four. A backend rate limit returns a structured error with `retry_after_seconds` instead of triggering silent retries. And a `--mock` mode serves deterministic data so I can test the whole flow, and record a demo, without spending a cent.

## The result

About six hundred lines of TypeScript. A user types "I'm going to Italy for ten days, find me 5GB," and the assistant searches, quotes, hands over a payment link, and renders the install QR once payment clears. No app, no dashboard, no new checkout page.

If you already have an API, you are most of the way there. Pick the three or four verbs your customers actually use, wrap each in one tool, gate money behind a payment link with an idempotency key, and ship a remote endpoint. The afternoon is real.

Code: `npx meisimusa-mcp`. Happy to answer questions in the comments.
