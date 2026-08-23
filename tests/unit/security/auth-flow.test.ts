/**
 * Auth/account service flows against a throwaway sqlite DB (same bootstrap
 * pattern as tests/integration/journey-core.test.ts):
 * registerDonor / authenticate / linkDonationToDonor through the REAL
 * service + rate-limit + scrypt password paths. DB URL is set before any
 * dynamic import so the prisma singleton binds to the disposable file.
 */
process.env.DATABASE_URL = "file:./test-auth.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// createSession()/destroySession() call next/headers cookies(); outside a
// request scope Next throws, so stub an in-memory jar for the session writer.
vi.mock("next/headers", () => {
  const jar = {
    store: new Map<string, string>(),
    get(name: string) {
      return jar.store.has(name) ? { name, value: jar.store.get(name) } : undefined;
    },
    set(name: string, value: string) {
      void jar.store.set(name, value);
    },
    delete(name: string) {
      void jar.store.delete(name);
    },
  };
  return { cookies: async () => jar };
});

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-auth.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-auth.db");

let prisma: Db;
let registerDonor: (typeof import("@/lib/services/account"))["registerDonor"];
let authenticate: (typeof import("@/lib/services/account"))["authenticate"];
let linkDonationToDonor: (typeof import("@/lib/services/account"))["linkDonationToDonor"];
let hashPassword: (typeof import("@/lib/auth/passwords"))["hashPassword"];

const STRONG = "correct horse battery 9";
let orgId: string;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  const passwords = await import("@/lib/auth/passwords");
  ({ hashPassword } = passwords);
  const account = await import("@/lib/services/account");
  ({ registerDonor, authenticate, linkDonationToDonor } = account);
  const org = await prisma.organization.create({
    data: { name: "Auth Test Blood Centre", kind: "BLOOD_BANK", status: "ACTIVE" },
  });
  orgId = org.id;
});

afterAll(async () => {
  const tables = [
    "auditLog",
    "session",
    "notification",
    "notificationPreference",
    "consentRecord",
    "donation",
    "donorProfile",
    "user",
    "organization",
  ] as const;
  if (prisma) {
    for (const table of tables) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any)[table].deleteMany({});
      } catch {
        // best-effort cleanup
      }
    }
    await prisma.$disconnect();
  }
  try {
    rmSync(DB_FILE, { force: true });
  } catch {
    // file may still be locked on Windows — best effort
  }
});

async function createUser(email: string, status = "ACTIVE") {
  return prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(STRONG),
      displayName: `User ${email}`,
      role: "DONOR",
      status,
    },
  });
}

describe("registerDonor", () => {
  it("creates User(role DONOR) + initial ConsentRecord and no DonorProfile yet (profile is created lazily at link time)", async () => {
    const res = await registerDonor({
      email: "Register-Success@Test.Example",
      password: STRONG,
      displayName: "Test Donor",
    });
    expect(res).toEqual({ ok: true, userId: expect.any(String) });

    const user = await prisma.user.findUnique({ where: { email: "register-success@test.example" } });
    expect(user?.role).toBe("DONOR");
    expect(user?.status).toBe("ACTIVE");
    expect(user?.passwordHash).toMatch(/^scrypt\$/);

    // Email is normalized to lowercase before storage.
    expect(user?.id).toBe(res.ok ? res.userId : "");

    const consents = await prisma.consentRecord.findMany({
      where: { subjectType: "DONOR_PLATFORM", subjectRef: user!.id },
    });
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({
      purposeKey: "account.lifecycle_notifications",
      granted: true,
    });

    // account.ts does NOT create a DonorProfile at registration time.
    expect(await prisma.donorProfile.findUnique({ where: { userId: user!.id } })).toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { action: "user.registered", resourceId: user!.id },
    });
    expect(audits).toHaveLength(1);
  });

  it("rejects duplicate email (case-insensitive) with EXISTS", async () => {
    const first = await registerDonor({
      email: "dup@example.com",
      password: STRONG,
      displayName: "First",
    });
    expect(first.ok).toBe(true);
    const second = await registerDonor({
      email: "  DUP@example.com ",
      password: STRONG,
      displayName: "Second",
    });
    expect(second).toEqual({ ok: false, reason: "EXISTS" });
  });

  it("rejects weak passwords with WEAK_PASSWORD", async () => {
    for (const weak of ["short1", "alllettersonly", "1234567890"]) {
      const res = await registerDonor({
        email: `weak-${weak.replace(/\s/g, "")}@example.com`,
        password: weak,
        displayName: "Weak",
      });
      expect(res).toEqual({ ok: false, reason: "WEAK_PASSWORD" });
    }
  });

  it("rejects malformed emails with INVALID", async () => {
    const res = await registerDonor({
      email: "not-an-email",
      password: STRONG,
      displayName: "Bad",
    });
    expect(res).toEqual({ ok: false, reason: "INVALID" });
  });

  it("returns RATE_LIMITED once the per-email register window is exhausted", async () => {
    const email = "flood@example.com";
    for (let i = 0; i < 5; i++) {
      const res = await registerDonor({ email, password: "weak1", displayName: "Flood" });
      expect(res).toEqual({ ok: false, reason: "WEAK_PASSWORD" });
    }
    const sixth = await registerDonor({ email, password: "weak1", displayName: "Flood" });
    expect(sixth).toEqual({ ok: false, reason: "RATE_LIMITED" });
  });
});

describe("authenticate", () => {
  it("yields INVALID for unknown email and wrong password alike (no enumeration via failure code)", async () => {
    const unknown = await authenticate("ghost@example.com", "whatever Long 123");
    expect(unknown).toEqual({ ok: false, reason: "INVALID" });

    await createUser("known@example.com");
    const wrongPw = await authenticate("known@example.com", "wrong password 42");
    expect(wrongPw).toEqual({ ok: false, reason: "INVALID" });
  });

  it("succeeds with correct credentials and creates a server-side Session", async () => {
    const user = await createUser("login-ok@example.com");
    const res = await authenticate("Login-Ok@Example.com", STRONG);
    expect(res).toEqual({ ok: true, userId: user.id, role: "DONOR" });

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const audits = await prisma.auditLog.findMany({
      where: { action: "session.created", resourceId: user.id },
    });
    expect(audits).toHaveLength(1);
  });

  it("returns DISABLED for a non-ACTIVE user even with correct credentials", async () => {
    await createUser("disabled@example.com", "DISABLED");
    const res = await authenticate("disabled@example.com", STRONG);
    expect(res).toEqual({ ok: false, reason: "DISABLED" });
  });

  it("returns RATE_LIMITED after MAX_AUTH_ATTEMPTS failures within the window", async () => {
    const email = "lockout@example.com";
    for (let i = 0; i < 10; i++) {
      const res = await authenticate(email, "bad pass 0001");
      expect(res).toEqual({ ok: false, reason: "INVALID" });
    }
    // Even valid credentials are refused while the bucket is exhausted.
    await createUser(email);
    const res = await authenticate(email, STRONG);
    expect(res).toEqual({ ok: false, reason: "RATE_LIMITED" });
  }, 60_000);
});

describe("linkDonationToDonor", () => {
  let linkCode: string;
  let donorA: Awaited<ReturnType<typeof createUser>>;
  let donorB: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    donorA = await createUser("link-a@example.com");
    donorB = await createUser("link-b@example.com");
    const donation = await prisma.donation.create({
      data: {
        organizationId: orgId,
        externalDonationId: "AUTH-TST-D001",
        donatedAt: new Date("2026-01-15T09:00:00Z"),
        recordedVia: "MANUAL",
      },
    });
    linkCode = donation.linkCode;
  });

  it("links a valid code once, creating the DonorProfile lazily when none exists", async () => {
    const res = await linkDonationToDonor(donorA.id, null, ` ${linkCode} `);
    expect(res).toEqual({ ok: true });

    const profile = await prisma.donorProfile.findUnique({ where: { userId: donorA.id } });
    expect(profile).not.toBeNull();

    const donation = await prisma.donation.findUnique({ where: { linkCode } });
    expect(donation).toMatchObject({ linkStatus: "LINKED", donorProfileId: profile!.id });

    const audits = await prisma.auditLog.findMany({
      where: { action: "donation.linked", resourceId: donation!.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.orgId).toBe(orgId);
  });

  it("rejects a second, different donor trying to claim the same code", async () => {
    const res = await linkDonationToDonor(donorB.id, null, linkCode);
    expect(res).toEqual({ ok: false });
    // Ownership must not have moved.
    const donation = await prisma.donation.findUnique({ where: { linkCode } });
    const profileA = await prisma.donorProfile.findUnique({ where: { userId: donorA.id } });
    expect(donation?.donorProfileId).toBe(profileA!.id);
  });

  it("fails explicitly when the donation is already linked (not idempotent success)", async () => {
    const res = await linkDonationToDonor(donorA.id, null, linkCode);
    expect(res).toEqual({ ok: false });
  });

  it("rejects codes that do not match the opaque format", async () => {
    for (const bad of ["", "a", "has space!", "../etc/passwd", "<script>"]) {
      const res = await linkDonationToDonor(donorA.id, null, bad);
      expect(res).toEqual({ ok: false });
    }
  });
});
