// The single choke point for talking to the MeiSIM dealer API. Every tool goes
// through callBackend(); no tool builds its own fetch. Responsibilities:
//   - attach the x-dealer-key header (never logged in full)
//   - translate HTTP failures into typed ToolErrors (401/402/404/429/5xx)
//   - surface 429 with retry_after_seconds; never retry silently
//   - in --mock mode, route to the in-memory mock instead of the network

import type { Config } from './config.js';
import { ToolError, codeForStatus } from './errors.js';
import { log, mask } from './logger.js';
import { mockBackend } from './mock.js';

export interface BackendRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}

export async function callBackend<T = unknown>(cfg: Config, req: BackendRequest): Promise<T> {
  if (cfg.mock) {
    log.info('mock call', { method: req.method, path: req.path });
    return mockBackend(req) as T;
  }

  const url = cfg.baseUrl + req.path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  // The retail endpoints are public — no key needed. Only attach x-dealer-key
  // if one is configured (for the B2B dealer endpoints).
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': `meisimusa-mcp/${cfg.version}`,
  };
  if (cfg.apiKey) headers['x-dealer-key'] = cfg.apiKey;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: req.method,
      headers,
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    log.error('network error', { path: req.path, key: mask(cfg.apiKey) });
    throw new ToolError('network_error', `Could not reach MeiSIM backend: ${(e as Error)?.message || e}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await resp.text();
  let data: unknown = undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = { raw: text }; }

  if (!resp.ok) {
    const msg =
      (data && typeof data === 'object' && ((data as any).message || (data as any).error)) ||
      `HTTP ${resp.status}`;

    if (resp.status === 429) {
      // Honor Retry-After (seconds, or HTTP-date). Default to 60s if absent.
      const ra = resp.headers.get('retry-after');
      let retryAfter = 60;
      if (ra) {
        const asNum = Number(ra);
        if (Number.isFinite(asNum)) retryAfter = asNum;
        else {
          const when = Date.parse(ra);
          if (!Number.isNaN(when)) retryAfter = Math.max(1, Math.round((when - Date.now()) / 1000));
        }
      }
      log.warn('rate limited', { path: req.path, retryAfter });
      throw new ToolError('rate_limited', `MeiSIM rate limit hit. Retry after ${retryAfter}s.`, {
        status: 429,
        retryAfterSeconds: retryAfter,
      });
    }

    log.warn('backend error', { path: req.path, status: resp.status });
    throw new ToolError(codeForStatus(resp.status), String(msg), { status: resp.status });
  }

  return data as T;
}
