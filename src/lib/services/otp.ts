import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/packages/database/client";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { sha256Hex, randomToken, hashWithPepper, safeEqual } from "@/lib/crypto";
import { hashedLimitKey, rateLimitPersistent } from "@/lib/rate-limit";
import { normalizePhone, phoneHashKey } from "@/lib/phone";
import { sendSms } from "@/packages/notifications/sms-sender";

/**
 * Mobile OTP verification for donor onboarding and emergency requests.
 *
 * Security properties:
 *  - codes are 6 digits, stored hashed (peppered SHA-256), single purpose;
 *  - 5-minute expiry, max 5 attempts per code, then the challenge is burned;
 *  - issue-side throttling per phone (fail-closed) and per IP via the
 *    persistent limiter, so a limiter outage can never disable OTP controls;
 *  - verification yields a one-time verification TOKEN (random, stored
 *    hashed) that the downstream mutation consumes — the code itself is
 *    never a bearer of authorization after the verify call.
 */

export const OTP_PURPOSES = ["DONOR_PHONE", "EMERGENCY_REQUEST"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

const CODE_TTL_MS = 5 * 60_000;
const TOKEN_TTL_MS = 30 * 60_000;
const MAX_ATTEMPTS = 5;
const ISSUE_LIMIT_PHONE = 3;
const ISSUE_WINDOW_MS = 15 * 60_000;
const ISSUE_LIMIT_IP = 20;
const ISSUE_IP_WINDOW_MS = 60 * 60_000;

export interface IssueOtpResult {
  ok: boolean;
  reason?: "INVALID_PHONE" | "RATE_LIMITED";
  retryAfterSec?: number;
  expiresAt?: Date;
  /** Dev/demo only: the code is returned to the UI when no SMS provider is configured. */
  devCode?: string;
}

function codeHash(code: string): string {
  return sha256Hex(`${env.APP_SECRET}:otp:${code}`);
}

function otpAudit(entry: Parameters<typeof recordAudit>[0]): Promise<void> {
  return recordAudit(entry);
}

export async function issueOtp(input: {
  purpose: OtpPurpose;
  phone: string;
  ip?: string | null;
}): Promise<IssueOtpResult> {
  const e164 = normalizePhone(input.phone);
  if (!e164) return { ok: false, reason: "INVALID_PHONE" };

  const pHash = phoneHashKey(e164);
  const perPhone = await rateLimitPersistent(
    hashedLimitKey(`otp:${input.purpose}`, pHash),
    ISSUE_LIMIT_PHONE,
    ISSUE_WINDOW_MS,
    { failClosed: true }
  );
  if (!perPhone.ok) {
    await otpAudit({
      actorType: "SYSTEM",
      action: "otp.issue_throttled",
      resourceType: "OtpChallenge",
      metadata: { purpose: input.purpose, scope: "phone" },
    });
    return { ok: false, reason: "RATE_LIMITED", retryAfterSec: perPhone.retryAfterSec };
  }
  if (input.ip) {
    const perIp = await rateLimitPersistent(
      hashedLimitKey("otp:ip", input.ip),
      ISSUE_LIMIT_IP,
      ISSUE_IP_WINDOW_MS,
      { failClosed: true }
    );
    if (!perIp.ok) {
      return { ok: false, reason: "RATE_LIMITED", retryAfterSec: perIp.retryAfterSec };
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  // New codes invalidate previous unconsumed ones for the same phone+purpose.
  await prisma.otpChallenge.updateMany({
    where: { phoneHash: pHash, purpose: input.purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.otpChallenge.create({
    data: {
      purpose: input.purpose,
      phoneHash: pHash,
      codeHash: codeHash(code),
      expiresAt,
      ipHash: input.ip ? hashWithPepper(input.ip) : null,
    },
  });

  const sent = await sendSms(
    e164,
    "RaktSetu verification code: " + code + ". It expires in 5 minutes. Never share it."
  );

  await otpAudit({
    actorType: "SYSTEM",
    action: "otp.issued",
    resourceType: "OtpChallenge",
    metadata: { purpose: input.purpose, smsSent: sent },
  });

  return {
    ok: true,
    expiresAt,
    // The plaintext code leaves the server ONLY in non-production and only
    // when no SMS adapter is configured — otherwise it exists in the SMS only.
    devCode: !env.isProd && !sent ? code : undefined,
  };
}

export interface VerifyOtpResult {
  ok: boolean;
  reason?: "NOT_FOUND" | "EXPIRED" | "LOCKED" | "INVALID";
  /** One-time token to pass to the guarded mutation (30 min TTL). */
  verificationToken?: string;
  expiresAt?: Date;
}

export async function verifyOtp(input: {
  purpose: OtpPurpose;
  phone: string;
  code: string;
}): Promise<VerifyOtpResult> {
  const e164 = normalizePhone(input.phone);
  if (!e164) return { ok: false, reason: "NOT_FOUND" };
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phoneHash: phoneHashKey(e164), purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) return { ok: false, reason: "NOT_FOUND" };
  if (challenge.expiresAt < new Date()) return { ok: false, reason: "EXPIRED" };
  if (challenge.attempts >= MAX_ATTEMPTS) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, reason: "LOCKED" };
  }

  const matches = safeEqual(codeHash(input.code.trim()), challenge.codeHash);
  if (!matches) {
    const attempts = challenge.attempts + 1;
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts, consumedAt: attempts >= MAX_ATTEMPTS ? new Date() : null },
    });
    await otpAudit({
      actorType: "SYSTEM",
      action: "otp.verify_failed",
      resourceType: "OtpChallenge",
      resourceId: challenge.id,
      metadata: { purpose: input.purpose, attempts },
    });
    return { ok: false, reason: attempts >= MAX_ATTEMPTS ? "LOCKED" : "INVALID" };
  }

  // Burn the code, issue the one-time verification token.
  const token = randomToken(24);
  const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: {
      consumedAt: new Date(),
      verifiedTokenHash: hashWithPepper(token),
      verifiedTokenExpiresAt: tokenExpiresAt,
    },
  });
  await otpAudit({
    actorType: "SYSTEM",
    action: "otp.verified",
    resourceType: "OtpChallenge",
    resourceId: challenge.id,
    metadata: { purpose: input.purpose },
  });
  return { ok: true, verificationToken: token, expiresAt: tokenExpiresAt };
}

export interface ConsumeTokenResult {
  ok: boolean;
  reason?: "INVALID" | "EXPIRED";
}

/**
 * Atomically consume a one-time verification token issued by verifyOtp().
 * `phone` must match the challenge the token was issued for — a token stolen
 * from one flow is useless on another number.
 */
export async function consumeVerificationToken(input: {
  purpose: OtpPurpose;
  phone: string;
  token: string;
}): Promise<ConsumeTokenResult> {
  const e164 = normalizePhone(input.phone);
  if (!e164 || !input.token) return { ok: false, reason: "INVALID" };
  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      phoneHash: phoneHashKey(e164),
      purpose: input.purpose,
      verifiedTokenHash: hashWithPepper(input.token),
    },
  });
  if (!challenge || !challenge.verifiedTokenHash) return { ok: false, reason: "INVALID" };
  if (challenge.verifiedTokenUsedAt) return { ok: false, reason: "INVALID" };
  if (
    !challenge.verifiedTokenExpiresAt ||
    challenge.verifiedTokenExpiresAt < new Date()
  ) {
    return { ok: false, reason: "EXPIRED" };
  }
  const updated = await prisma.otpChallenge.updateMany({
    // Guarded update: exactly one concurrent caller wins the consumption.
    where: { id: challenge.id, verifiedTokenUsedAt: null },
    data: { verifiedTokenUsedAt: new Date() },
  });
  if (updated.count !== 1) return { ok: false, reason: "INVALID" };
  return { ok: true };
}
