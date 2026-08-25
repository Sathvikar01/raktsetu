import "server-only";
/**
 * Rate limiting.
 *
 * rateLimitPersistent() is a DB-backed fixed-window limiter shared across all
 * app instances (any Prisma-supported database) — the production default.
 * Slight overshoot under write races is accepted by design; fail-open on DB
 * errors so availability beats strictness for this control.
 *
 * rateLimit() (in-memory sliding window) remains for tests and as a
 * zero-database fallback; it is NOT distributed — do not use in multi-node
 * production paths.
 */
import { prisma } from "@/packages/database/client";

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

/** Opportunistic garbage collection of expired buckets (~1% of calls). */
async function pruneExpired(maxAgeMs: number): Promise<void> {
  if (Math.random() > 0.01) return;
  try {
    await prisma.rateLimitBucket.deleteMany({
      where: { updatedAt: { lt: new Date(Date.now() - maxAgeMs) } },
    });
  } catch {
    // best effort
  }
}

const PRUNE_HORIZON_MS = 24 * 60 * 60 * 1000;

export async function rateLimitPersistent(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateResult> {
  const deny = (retryAfterSec: number): RateResult => ({
    ok: false,
    remaining: 0,
    retryAfterSec: Math.max(1, retryAfterSec),
  });

  try {
    const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });
    const now = Date.now();

    if (!existing || now - existing.windowStart.getTime() >= windowMs) {
      // New window. Upsert keeps racing instances consistent (count restarts).
      await prisma.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, windowStart: new Date(now) },
        update: { count: 1, windowStart: new Date(now) },
      });
      void pruneExpired(Math.max(PRUNE_HORIZON_MS, windowMs));
      return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
    }

    const updated = await prisma.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
    });

    if (updated.count > limit) {
      const retryAfterMs =
        existing.windowStart.getTime() + windowMs - now;
      return deny(Math.ceil(retryAfterMs / 1000));
    }
    return { ok: true, remaining: Math.max(0, limit - updated.count), retryAfterSec: 0 };
  } catch {
    // Fail open: rate limiting must not take the API down with it.
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
}
