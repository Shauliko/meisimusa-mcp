#!/usr/bin/env node
// Entry point. Launched as a subprocess by the MCP client (Claude Desktop,
// Cursor, etc.) over stdio. stdout carries the MCP protocol; all logging goes
// to stderr (see logger.ts).
//
// Flags / env:
//   --mock                 serve everything from the in-memory mock (no network)
//   MEISIMUSA_API_KEY      dealer API key (required unless --mock)
//   MEISIMUSA_API_BASE     override backend base URL (default https://meisimusa.com)

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';
import { log } from './logger.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const server = buildServer(cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('server started', {
    mock: cfg.mock,
    base: cfg.baseUrl,
    has_api_key: !!cfg.apiKey,
    version: cfg.version,
  });
}

main().catch((e) => {
  log.error('fatal startup error', { message: (e as Error)?.message || String(e) });
  process.exit(1);
});
