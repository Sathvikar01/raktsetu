/**
 * Persistent limiter behavior against a throwaway sqlite DB:
 * - fixed-window allow/deny semantics
 * - peek does not consume quota
 * - fail-open default vs fail-closed option on limiter failure
 * - hashedLimitKey is deterministic and never returns the raw value
 */
process.env.DATABASE_URL = "file:./test-ratelim.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-ratelim.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-ratelim.db");

let prisma: Db;
let rateLimitPersistent: (typeof import("@/lib/rate-limit"))["rateLimitPersistent"];
let peekRateLimitPersistent: (typeof import("@/lib/rate-limit"))["peekRateLimitPersistent"];
let hashedLimitKey: (typeof import("@/lib/rate-limit"))["hashedLimitKey"];

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  const mod = await import("@/lib/rate-limit");
  ({ rateLimitPersistent, peekRateLimitPersistent, hashedLimitKey } = mod);
});

afterAll(async () => {
  if (prisma) {
    await prisma.rateLimitBucket.deleteMany({});
    await prisma.$disconnect();
  }
  try {
    rmSync(DB_FILE, { force: true });
  } catch {
    // file may still be locked on Windows — best effort
  }
});

describe("rateLimitPersistent", () => {
  it("allows up to the limit then denies with retryAfterSec", async () => {
    const key = `t1:${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      const r = await rateLimitPersistent(key, 3, 60_000);
      expect(r.ok).toBe(true);
    }
    const denied = await rateLimitPersistent(key, 3, 60_000);
    expect(denied.ok).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it("starts a fresh window after windowMs", async () => {
    const key = `t2:${Date.now()}`;
    await rateLimitPersistent(key, 1, 50);
    expect((await rateLimitPersistent(key, 1, 50)).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 70));
    expect((await rateLimitPersistent(key, 1, 50)).ok).toBe(true);
  });
});

describe("peekRateLimitPersistent", () => {
  it("reports denial without consuming quota", async () => {
    const key = `t3:${Date.now()}`;
    // Exhaust via two real charges against a limit of 2.
    await rateLimitPersistent(key, 2, 60_000);
    await rateLimitPersistent(key, 2, 60_000);
    const peekedDenied = await peekRateLimitPersistent(key, 2, 60_000);
    expect(peekedDenied.ok).toBe(false);

    // A peek on a partially-used bucket leaves remaining untouched.
    const key2 = `t4:${Date.now()}`;
    await rateLimitPersistent(key2, 5, 60_000);
    const before = await peekRateLimitPersistent(key2, 5, 60_000);
    expect(before.ok).toBe(true);
    expect(before.remaining).toBe(4);
    const after = await peekRateLimitPersistent(key2, 5, 60_000);
    expect(after.remaining).toBe(4);
  });
});

describe("fail mode on limiter failure", () => {
  it("fails open by default and fails closed when requested", async () => {
    const broken = prisma as unknown as { rateLimitBucket: unknown };
    const original = broken.rateLimitBucket;
    // Simulate a limiter outage.
    (broken as { rateLimitBucket: null }).rateLimitBucket = null;
    try {
      const openResult = await rateLimitPersistent(`t5:${Date.now()}`, 1, 60_000);
      expect(openResult.ok).toBe(true);

      const closedResult = await rateLimitPersistent(`t6:${Date.now()}`, 1, 60_000, {
        failClosed: true,
      });
      expect(closedResult.ok).toBe(false);
      expect(closedResult.retryAfterSec).toBeGreaterThan(0);
    } finally {
      broken.rateLimitBucket = original;
    }
  });
});

describe("hashedLimitKey", () => {
  it("is deterministic, namespaced and never leaks the raw value", async () => {
    const a = hashedLimitKey("email", "donor@example.com");
    const b = hashedLimitKey("email", "donor@example.com");
    expect(a).toBe(b);
    expect(a).not.toContain("donor@example.com");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(hashedLimitKey("ip", "donor@example.com")).not.toBe(a);
    expect(hashedLimitKey("email", "other@example.com")).not.toBe(a);
  });
});
