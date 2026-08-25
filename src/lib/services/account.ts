import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/packages/database/client";
import { hashPassword, verifyPassword, passwordIssues } from "@/lib/auth/passwords";
import { createSession, destroySession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import {
  hashedLimitKey,
  peekRateLimitPersistent,
  rateLimitPersistent,
} from "@/lib/rate-limit";
import { issueEmailVerification } from "@/lib/services/email-verification";
import { mfaRequiredFor } from "@/lib/services/mfa";

export type AuthFailure =
  | "INVALID"
  | "RATE_LIMITED"
  | "EXISTS"
  | "WEAK_PASSWORD"
  | "DISABLED"
  | "EMAIL_UNVERIFIED";

const MAX_AUTH_ATTEMPTS = 10;
const AUTH_WINDOW_MS = 15 * 60_000;

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  ipHash?: string | null;
}

export async function registerDonor(
  input: RegisterInput
): Promise<{ ok: true; userId: string } | { ok: false; reason: AuthFailure }> {
  const email = input.email.trim().toLowerCase();
  // Sensitive auth limit: hashed key (no raw emails at rest) + fail closed.
  const rl = await rateLimitPersistent(
    `register:${hashedLimitKey("email", email)}`,
    5,
    AUTH_WINDOW_MS,
    { failClosed: true }
  );
  if (!rl.ok) {
    return { ok: false, reason: "RATE_LIMITED" };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, reason: "INVALID" };
  if (passwordIssues(input.password).length > 0) return { ok: false, reason: "WEAK_PASSWORD" };
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return { ok: false, reason: "EXISTS" };

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(input.password),
        displayName: input.displayName.slice(0, 80),
        role: "DONOR",
        notificationPreference: { create: {} },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, reason: "EXISTS" };
    }
    throw err;
  }
  await prisma.consentRecord.create({
    data: {
      subjectType: "DONOR_PLATFORM",
      subjectRef: user.id,
      purposeKey: "account.lifecycle_notifications",
      granted: true,
      policyVersion: "1.0",
    },
  });
  // Fire-and-forget verification email (queued via outbox worker).
  try {
    await issueEmailVerification(user.id);
  } catch {
    // Registration must not fail because mail queueing did.
  }
  await recordAudit({
    actorType: "USER", actorId: user.id, action: "user.registered",
    resourceType: "User", resourceId: user.id, ipHash: input.ipHash ?? null,
  });
  return { ok: true, userId: user.id };
}

export async function authenticate(
  email: string,
  password: string,
  opts?: { expectRole?: Array<"DONOR" | "ORG_STAFF" | "ORG_ADMIN" | "PLATFORM_ADMIN">; ipHash?: string | null }
): Promise<
  | { ok: true; userId: string; role: string; mfaRequired?: boolean }
  | { ok: false; reason: AuthFailure }
> {
  const key = `login:${hashedLimitKey("email", email.trim().toLowerCase())}`;
  // Sensitive auth limit: hashed key + fail closed on limiter failure.
  const rl = await rateLimitPersistent(key, MAX_AUTH_ATTEMPTS, AUTH_WINDOW_MS, {
    failClosed: true,
  });
  if (!rl.ok) return { ok: false, reason: "RATE_LIMITED" };

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Constant-ish work whether or not user exists (mitigates user enumeration timing).
  const hash = user?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  const valid = verifyPassword(password, hash);
  if (!user || !valid) return { ok: false, reason: "INVALID" };
  if (user.status !== "ACTIVE") return { ok: false, reason: "DISABLED" };
  if (opts?.expectRole && !opts.expectRole.includes(user.role as never)) {
    return { ok: false, reason: "INVALID" };
  }
  // Stronger gate for privileged roles: the email channel must be verified
  // before staff can act on clinical-adjacent records.
  const PRIVILEGED = new Set(["ORG_STAFF", "ORG_ADMIN", "PLATFORM_ADMIN"]);
  if (PRIVILEGED.has(user.role) && !user.emailVerifiedAt) {
    return { ok: false, reason: "EMAIL_UNVERIFIED" };
  }

  // MFA: admins stop after the first factor — no session exists until the
  // TOTP challenge (or forced enrollment) completes.
  if (mfaRequiredFor(user.role)) {
    await recordAudit({
      actorType: "USER", actorId: user.id, action: "auth.mfa_pending",
      resourceType: "User", resourceId: user.id, ipHash: opts?.ipHash ?? null,
    });
    return { ok: true, userId: user.id, role: user.role, mfaRequired: true };
  }

  await createSession(user.id);
  await recordAudit({
    actorType: "USER", actorId: user.id, action: "session.created",
    resourceType: "User", resourceId: user.id, ipHash: opts?.ipHash ?? null,
  });
  return { ok: true, userId: user.id, role: user.role };
}

export async function logout(): Promise<void> {
  await destroySession();
}

/**
 * Link a blood-bank-recorded donation to the signed-in donor via its opaque
 * single-use link code. Codes are printed on donation acknowledgements (demo:
 * staff portal / seed output). Attempts audited; generic failure copy.
 * FAILED attempts are rate limited per user + hashed IP (fail closed).
 */
export type LinkFailure = "INVALID" | "RATE_LIMITED";
const MAX_LINK_FAILURES = 10;
const LINK_FAILURE_WINDOW_MS = 15 * 60_000;

export async function linkDonationToDonor(
  userId: string,
  donorProfileId: string | null,
  linkCode: string,
  ip?: string | null
): Promise<{ ok: true } | { ok: false; reason: LinkFailure }> {
  const failKey = `linkfail:${userId}:${hashedLimitKey("ip", ip ?? "unknown")}`;
  const code = linkCode.trim();
  const denyRateLimited = async (): Promise<{ ok: false; reason: LinkFailure }> => {
    // Charge the failed attempt before reporting it.
    await rateLimitPersistent(failKey, MAX_LINK_FAILURES, LINK_FAILURE_WINDOW_MS, {
      failClosed: true,
    });
    return { ok: false, reason: "INVALID" };
  };

  if (!/^[A-Za-z0-9-]{6,32}$/.test(code)) {
    return denyRateLimited();
  }
  // Budget check WITHOUT consuming quota — only failures are charged.
  const budget = await peekRateLimitPersistent(failKey, MAX_LINK_FAILURES, LINK_FAILURE_WINDOW_MS);
  if (!budget.ok) return { ok: false, reason: "RATE_LIMITED" };

  const donation = await prisma.donation.findUnique({
    where: { linkCode: code },
    include: { organization: { select: { name: true } } },
  });
  if (!donation || donation.linkStatus !== "UNLINKED") {
    return denyRateLimited();
  }

  class LinkLostRaceError extends Error {}
  try {
    await prisma.$transaction(async (tx) => {
      let profileId = donorProfileId;
      if (!profileId) {
        profileId = (await tx.donorProfile.create({ data: { userId } })).id;
      }
      // Conditional claim: only an UNLINKED donation may transition, so two
      // concurrent claims of one code cannot both succeed.
      const claimed = await tx.donation.updateMany({
        where: { id: donation.id, linkStatus: "UNLINKED" },
        data: { donorProfileId: profileId, linkStatus: "LINKED" },
      });
      if (claimed.count === 0) throw new LinkLostRaceError();
    });
  } catch (err) {
    if (err instanceof LinkLostRaceError) return denyRateLimited();
    throw err;
  }
  await recordAudit({
    actorType: "USER", actorId: userId, action: "donation.linked",
    resourceType: "Donation", resourceId: donation.id, orgId: donation.organizationId,
  });
  return { ok: true };
}
