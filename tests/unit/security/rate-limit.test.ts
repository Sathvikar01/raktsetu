/**
 * Pure unit tests over the in-memory sliding-window rate limiter.
 * No DB, no server wiring: allows up to `limit`, blocks `limit + 1`,
 * resets once the window has fully elapsed (fake timers advance the clock).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { rateLimit } from "@/lib/rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("allows every call up to the limit within one window", () => {
    const key = "unit:allow";
    for (let i = 1; i <= 5; i++) {
      const res = rateLimit(key, 5, 60_000);
      expect(res.ok).toBe(true);
      expect(res.remaining).toBe(5 - i);
      expect(res.retryAfterSec).toBe(0);
    }
  });

  it("blocks call limit+1 with retryAfterSec > 0 and zero remaining", () => {
    const key = "unit:block";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const res = rateLimit(key, 3, 60_000);
    expect(res.ok).toBe(false);
    expect(res.remaining).toBe(0);
    expect(res.retryAfterSec).toBeGreaterThan(0);
    expect(res.retryAfterSec).toBeLessThanOrEqual(60);
    // Still blocked on further attempts — no bucket growth while denied.
    expect(rateLimit(key, 3, 60_000).ok).toBe(false);
  });

  it("keys buckets independently per key", () => {
    expect(rateLimit("unit:key-a", 1, 60_000).ok).toBe(true);
    expect(rateLimit("unit:key-a", 1, 60_000).ok).toBe(false);
    expect(rateLimit("unit:key-b", 1, 60_000).ok).toBe(true);
  });

  it("resets after the window elapses (fake-advanced clock)", async () => {
    vi.useFakeTimers();
    const key = "unit:reset";
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    for (let i = 0; i < 2; i++) expect(rateLimit(key, 2, 30_000).ok).toBe(true);
    expect(rateLimit(key, 2, 30_000).ok).toBe(false);

    // Advance past the full window: all hits have aged out.
    vi.advanceTimersByTime(30_001);
    const res = rateLimit(key, 2, 30_000);
    expect(res.ok).toBe(true);
    expect(res.remaining).toBe(1);
  });

  it("keeps partial history mid-window (sliding, not fixed)", () => {
    vi.useFakeTimers();
    const key = "unit:sliding";
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    expect(rateLimit(key, 2, 10_000).ok).toBe(true);
    vi.advanceTimersByTime(6_000);
    expect(rateLimit(key, 2, 10_000).ok).toBe(true);
    expect(rateLimit(key, 2, 10_000).ok).toBe(false);

    // Only the first hit is older than the window now; one slot frees up.
    vi.advanceTimersByTime(4_001);
    const res = rateLimit(key, 2, 10_000);
    expect(res.ok).toBe(true);
  });
});
