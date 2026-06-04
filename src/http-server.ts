#!/usr/bin/env node
// Remote MCP endpoint over Streamable HTTP (the current standard transport;
// SSE is deprecated). This is what makes the server usable from claude.ai web,
// Claude mobile, ChatGPT, Perplexity, etc. — the AI connects to this URL from
// its own cloud, so the user installs nothing.
//
// Stateless mode (a fresh server+transport per request) keeps it simple and
// horizontally scalable. Run it as a LONG-LIVED process (e.g. on your Vultr box
// behind Caddy at https://mcp.meisimusa.com) so the in-process idempotency
// cache persists across requests. No new npm deps — Node's http + the SDK.
//
// Env: PORT (default 8787), MCP_PATH (default /mcp), plus the same MEISIMUSA_*
// vars as the stdio server (MEISIMUSA_API_KEY is optional — the retail path is
// public).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';
import { log } from './logger.js';

const cfg = loadConfig([]);
const PORT = Number(process.env.PORT || 8787);
const MCP_PATH = process.env.MCP_PATH || '/mcp';
// ChatGPT can't sell digital goods, so it connects to the info-only path
// (search + quote, no purchase). Claude / Grok / direct users use /mcp.
const INFO_PATH = process.env.MCP_INFO_PATH || '/mcp-info';

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : undefined); } catch { resolve(undefined); }
    });
    req.on('error', () => resolve(undefined));
  });
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = (req.url || '').split('?')[0];

  // CORS — the ChatGPT app submission "Scan Tools" check (and browser-based MCP
  // clients) call this endpoint from the browser, which silently fails without
  // these headers. Server-to-server callers ignore them, so this is safe.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: cfg.version }));
    return;
  }
  const isFull = url === MCP_PATH;
  const isInfo = url === INFO_PATH;
  if (!isFull && !isInfo) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  if (req.method !== 'POST') {
    // Stateless Streamable HTTP only needs POST; reject GET/DELETE cleanly.
    res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method Not Allowed: POST only.' }, id: null }));
    return;
  }

  try {
    const body = await readBody(req);
    const mcp = buildServer(isInfo ? { ...cfg, infoOnly: true } : cfg);
    // enableJsonResponse: reply with plain application/json instead of an SSE
    // stream, which the OpenAI scanner (and simpler clients) parse reliably.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); mcp.close(); });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    log.error('http request failed', { message: (e as Error)?.message || String(e) });
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }));
    }
  }
});

httpServer.listen(PORT, () =>
  log.info('streamable-http server listening', { port: PORT, path: MCP_PATH, mock: cfg.mock, has_key: !!cfg.apiKey }),
);
