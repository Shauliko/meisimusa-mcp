// Tiny in-process memory. NOT a database — it lives only for the lifetime of
// this MCP subprocess (one per user session). Two uses:
//
//   1. Idempotency: a purchase called twice with the same idempotency_key in
//      the same session returns the first order's result (prevents an AI agent
//      retry from double-ordering). Durable cross-process idempotency still
//      needs backend enforcement — see README work items.
//   2. Activation artifacts: the QR/LPA is returned at ORDER time. We stash it
//      keyed by ICCID so get_activation can hand it back even though the
//      dealer details endpoint is keyed by ICCID and may not re-return the QR.

interface Entry<T> { value: T; at: number; }

const TTL_MS = 60 * 60 * 1000; // 1 hour

class TtlMap<T> {
  private m = new Map<string, Entry<T>>();
  get(key: string): T | undefined {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (Date.now() - e.at > TTL_MS) { this.m.delete(key); return undefined; }
    return e.value;
  }
  set(key: string, value: T): void {
    this.m.set(key, { value, at: Date.now() });
  }
}

export interface PurchaseResult {
  order_id: string;
  status: 'completed' | 'pending' | 'failed';
  receipt_url: string | null;
  error?: string;
}

export interface ActivationArtifacts {
  qr_code_png_base64?: string | null;
  activation_code?: string | null;
  smdp?: string | null;
}

export const idempotencyStore = new TtlMap<PurchaseResult>();
export const activationStore = new TtlMap<ActivationArtifacts>();
