import "server-only";
/**
 * TOTP MFA for privileged roles (ORG_STAFF, ORG_ADMIN, PLATFORM_ADMIN).
 *
 * Flow: password check succeeds -> if MFA is required and enrolled, NO session
 * is created; instead a short-lived signed "pending login" cookie is issued
 * and the user is redirected to /mfa/challenge. The pending cookie alone
 * grants nothing except completing the second factor. First-time enrolment is
 * forced through /mfa/enroll before any admin surface becomes reachable.
 */
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { prisma } from "@/packages/database/client";
import { env } from "@/lib/env";
import { generateTotpSecret, otpauthUri, verifyTotp } from "@/lib/auth/totp";
import { decryptSecretFlexible, encryptSecret, looksEncryptedSecret } from "@/lib/crypto";
import { peekRateLimitPersistent, rateLimitPersistent } from "@/lib/rate-limit";

export const MFA_PENDING_COOKIE = "rs_mfa_pending";

const PENDING_TTL_MS = 5 * 60_000;
const MFA_WINDOW_MS = 15 * 60_000;
const MFA_MAX_ATTEMPTS = 5;

// ORG_STAFF is included: staff act on clinical-adjacent records, so the
// second factor is required for every privileged role (REQUIRE_ADMIN_MFA).
const ADMIN_ROLES = new Set(["ORG_STAFF", "ORG_ADMIN", "PLATFORM_ADMIN"]);

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

/** Does this account have to pass the second factor right now? */
export function mfaRequiredFor(role: string): boolean {
  return env.REQUIRE_ADMIN_MFA && isAdminRole(role);
}

/** Has the account completed TOTP enrollment? */
export async function mfaEnrolled(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnrolledAt: true },
  });
  return Boolean(user?.mfaEnrolledAt);
}

function signPending(userId: string, expiresAt: number): string {
  const payload = `${userId}.${expiresAt}`;
  const mac = createHmac("sha256", `${env.APP_SECRET}:mfa-pending`).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

function verifyPending(raw: string): { userId: string } | null {
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresRaw, mac] = parts as [string, string, string];
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  const expected = createHmac("sha256", `${env.APP_SECRET}:mfa-pending`)
    .update(`${userId}.${expiresRaw}`)
    .digest("hex");
  if (mac.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  return { userId };
}

/** Issue the short-lived second-factor cookie for a verified-password login. */
export async function beginMfaChallenge(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(MFA_PENDING_COOKIE, signPending(userId, Date.now() + PENDING_TTL_MS), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: PENDING_TTL_MS / 1000,
  });
}

/** Read + clear-check the pending login (no side effects). */
export async function readMfaPendingUserId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(MFA_PENDING_COOKIE)?.value;
  if (!raw) return null;
  return verifyPending(raw)?.userId ?? null;
}

async function clearPending(): Promise<void> {
  const jar = await cookies();
  jar.delete(MFA_PENDING_COOKIE);
}

export interface MfaEnrollView {
  secret: string;
  uri: string;
  email: string;
}

/**
 * First-factor done + not yet enrolled: provision (or re-provision) a secret
 * and render the QR. The account stays without an admin session until a valid
 * code confirms the secret.
 */
export async function loadOrCreateEnrollment(userId: string): Promise<MfaEnrollView | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, mfaSecret: true, mfaEnrolledAt: true },
  });
  if (!user || user.mfaEnrolledAt) return null;

  // Secrets are always encrypted at rest (AES-256-GCM). A pre-existing
  // plaintext secret (pre-hardening row) is transparently re-saved encrypted.
  let stored = user.mfaSecret;
  if (!stored) {
    stored = encryptSecret(generateTotpSecret());
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: stored, mfaLastCounter: 0 },
    });
  } else if (!looksEncryptedSecret(stored)) {
    stored = encryptSecret(stored);
    await prisma.user.update({ where: { id: userId }, data: { mfaSecret: stored } });
  }
  const secret = decryptSecretFlexible(stored);
  return { secret, uri: otpauthUri(secret, user.email, "RaktSetu"), email: user.email };
}

export type MfaFailure = "EXPIRED" | "INVALID" | "RATE_LIMITED";

/** Complete enrollment with the first valid code, then open the session. */
export async function confirmEnrollment(
  userId: string,
  code: string,
  openSession: (userId: string) => Promise<void>
): Promise<{ ok: true } | { ok: false; reason: MfaFailure }> {
  return verifyAndOpen(userId, code, openSession, { enroll: true });
}

/** Second factor for an already-enrolled admin. */
export async function verifyMfaChallenge(
  userId: string,
  code: string,
  openSession: (userId: string) => Promise<void>
): Promise<{ ok: true } | { ok: false; reason: MfaFailure }> {
  return verifyAndOpen(userId, code, openSession, { enroll: false });
}

async function verifyAndOpen(
  userId: string,
  code: string,
  openSession: (userId: string) => Promise<void>,
  opts: { enroll: boolean }
): Promise<{ ok: true } | { ok: false; reason: MfaFailure }> {
  if (!(await readMfaPendingUserId())) return { ok: false, reason: "EXPIRED" };

  const attemptsKey = `mfa-attempts:${userId}`;
  // Peek-then-charge: the bucket is only consumed by FAILED attempts, and
  // rateLimitPersistent resets the window when it expires (no sticky window).
  const recent = await peekRateLimitPersistent(attemptsKey, MFA_MAX_ATTEMPTS, MFA_WINDOW_MS);
  if (!recent.ok) return { ok: false, reason: "RATE_LIMITED" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnrolledAt: true, mfaLastCounter: true },
  });
  if (!user?.mfaSecret || (!opts.enroll && !user.mfaEnrolledAt)) {
    return { ok: false, reason: "EXPIRED" };
  }

  const result = verifyTotp(decryptSecretFlexible(user.mfaSecret), code, user.mfaLastCounter);
  if (!result.ok || result.counter === undefined) {
    try {
      await rateLimitPersistent(attemptsKey, MFA_MAX_ATTEMPTS, MFA_WINDOW_MS, { failClosed: true });
    } catch {
      // limiter row failure must not bypass verification itself
    }
    return { ok: false, reason: "INVALID" };
  }

  // Success: a fresh code resets the attempt budget entirely.
  await prisma.rateLimitBucket
    .delete({ where: { key: attemptsKey } })
    .catch(() => undefined);

  await prisma.user.update({
    where: { id: userId },
    data: opts.enroll ? { mfaEnrolledAt: new Date(), mfaEnabled: true, mfaLastCounter: result.counter } : { mfaLastCounter: result.counter },
  });

  await openSession(userId);
  await clearPending();
  return { ok: true };
}
