import "server-only";
/**
 * Rate limiting.
 *
 * rateLimitPersistent() is a DB-backed fixed-window limiter shared across all
 * app instances (any Prisma-supported database) — the production default.
 * Slight overshoot under write races is accepted by design.
 *
 * Failure policy: fail-OPEN by default (availability beats strictness for
 * public aggregate surfaces). Sensitive auth/link limits pass
 * { failClosed: true } so a limiter outage can never disable them.
 *
 * Keys containing emails or IPs MUST be built with hashedLimitKey(): raw
 * identifiers are never persisted in RateLimitBucket rows.
 *
 * rateLimit() (in-memory sliding window) remains for tests and as a
 * zero-database fallback; it is NOT distributed — do not use in multi-node
 * production paths.
 */
import { createHmac } from "node:crypto";
import { prisma } from "@/packages/database/client";
import { env } from "@/lib/env";

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

/**
 * Privacy-safe limiter key material: salted HMAC over the raw identifier
 * (email, IP, …). Deterministic for windowing, irreversible at rest.
 */
export function hashedLimitKey(namespace: string, value: string): string {
  return createHmac("sha256", `${env.APP_SECRET}:ratelimit`)
    .update(`${namespace}:${value}`)
    .digest("hex")
    .slice(0, 32);
}

/** First-hop client IP from proxy headers, or null when absent. */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || null;
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

export interface PersistentRateOptions {
  /** Throw-closed on limiter failure — for auth/link controls. Default: false. */
  failClosed?: boolean;
}

function denied(retryAfterSec: number): RateResult {
  return { ok: false, remaining: 0, retryAfterSec: Math.max(1, retryAfterSec) };
}

const FAIL_CLOSED_RETRY_SEC = 30;

export async function rateLimitPersistent(
  key: string,
  limit: number,
  windowMs: number,
  opts?: PersistentRateOptions
): Promise<RateResult> {
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
      return denied(Math.ceil(retryAfterMs / 1000));
    }
    return { ok: true, remaining: Math.max(0, limit - updated.count), retryAfterSec: 0 };
  } catch {
    if (opts?.failClosed) {
      // Sensitive control + limiter unavailable ⇒ block rather than bypass.
      return denied(FAIL_CLOSED_RETRY_SEC);
    }
    // Fail open: rate limiting must not take the API down with it.
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
}

/**
 * Read-only quota check — consumes nothing. Pair with rateLimitPersistent()
 * to charge the bucket only when the guarded action actually fails.
 */
export async function peekRateLimitPersistent(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateResult> {
  try {
    const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });
    const now = Date.now();
    if (!existing || now - existing.windowStart.getTime() >= windowMs) {
      return { ok: true, remaining: limit, retryAfterSec: 0 };
    }
    if (existing.count >= limit) {
      return denied(Math.ceil((existing.windowStart.getTime() + windowMs - now) / 1000));
    }
    return { ok: true, remaining: Math.max(0, limit - existing.count), retryAfterSec: 0 };
  } catch {
    // Peek never fabricates a denial; callers enforce their own fail mode.
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
}
