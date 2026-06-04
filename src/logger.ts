// Diagnostics go to STDERR only — stdout is reserved for the MCP protocol on
// the stdio transport. Nothing sensitive is ever printed: API keys, payment
// tokens, and QR/LPA strings are masked to first-4 + last-4.

/** Mask any identifier/secret: keep first 4 + last 4, redact the middle. */
export function mask(value: unknown): string {
  const s = String(value ?? '');
  if (s.length <= 8) return s.length ? '*'.repeat(s.length) : '';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Recursively mask known-sensitive keys in an object for safe logging. */
const SENSITIVE_KEYS = /key|token|secret|authorization|qr|qrcode|qr_code|lpa|activation_code|password/i;
export function sanitize(obj: unknown): unknown {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.test(k) ? mask(v) : sanitize(v);
  }
  return out;
}

function line(level: string, msg: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const extra = meta === undefined ? '' : ' ' + JSON.stringify(sanitize(meta));
  process.stderr.write(`[meisimusa-mcp] ${ts} ${level} ${msg}${extra}\n`);
}

export const log = {
  info: (msg: string, meta?: unknown) => line('INFO', msg, meta),
  warn: (msg: string, meta?: unknown) => line('WARN', msg, meta),
  error: (msg: string, meta?: unknown) => line('ERROR', msg, meta),
};
