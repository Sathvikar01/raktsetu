import "server-only";
/**
 * In-memory sliding-window rate limiter.
 * Single-instance deployments only; production multi-node should point this
 * interface at Redis (documented in docs/deployment.md).
 */
interface Bucket {
  hits: number[];
}
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    b.hits = b.hits.filter((t) => now - t < windowMs);
    if (b.hits.length === 0) buckets.delete(k);
  }
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  sweep(Math.max(windowMs, 60_000));
  const now = Date.now();
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    const oldest = Math.min(...b.hits);
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((oldest + windowMs - now) / 1000) };
  }
  b.hits.push(now);
  buckets.set(key, b);
  return { ok: true, remaining: limit - b.hits.length, retryAfterSec: 0 };
}
