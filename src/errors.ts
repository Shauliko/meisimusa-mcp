// Structured tool errors. Every tool returns a predictable error envelope so
// the LLM (and our tests) can reason about failures instead of parsing prose.

export type ErrorCode =
  | 'unauthorized'        // 401 — bad/missing API key
  | 'not_found'           // 404 — country/plan/order not found
  | 'rate_limited'        // 429 — caller should back off
  | 'payment_required'    // 402 — insufficient wallet balance
  | 'invalid_input'       // local Zod / validation failure
  | 'backend_error'       // 5xx or unexpected upstream response
  | 'network_error';      // could not reach the backend

export interface ToolErrorShape {
  error: ErrorCode;
  message: string;
  /** Present only on rate_limited. */
  retry_after_seconds?: number;
  /** HTTP status when the error came from the backend. */
  status?: number;
}

export class ToolError extends Error {
  code: ErrorCode;
  status?: number;
  retryAfterSeconds?: number;

  constructor(code: ErrorCode, message: string, opts: { status?: number; retryAfterSeconds?: number } = {}) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.status = opts.status;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }

  toShape(): ToolErrorShape {
    const shape: ToolErrorShape = { error: this.code, message: this.message };
    if (this.status !== undefined) shape.status = this.status;
    if (this.retryAfterSeconds !== undefined) shape.retry_after_seconds = this.retryAfterSeconds;
    return shape;
  }
}

/** Map an HTTP status to a ToolError code. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401: return 'unauthorized';
    case 402: return 'payment_required';
    case 404: return 'not_found';
    case 429: return 'rate_limited';
    default:  return status >= 500 ? 'backend_error' : 'invalid_input';
  }
}
