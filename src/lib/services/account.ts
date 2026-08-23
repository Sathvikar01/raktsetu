import "server-only";
import { prisma } from "@/packages/database/client";
import { hashPassword, verifyPassword, passwordIssues } from "@/lib/auth/passwords";
import { createSession, destroySession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

const MAX_AUTH_ATTEMPTS = 10;
const AUTH_WINDOW_MS = 15 * 60_000;

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  ipHash?: string | null;
}

export type AuthFailure = "INVALID" | "RATE_LIMITED" | "EXISTS" | "WEAK_PASSWORD" | "DISABLED";

export async function registerDonor(
  input: RegisterInput
): Promise<{ ok: true; userId: string } | { ok: false; reason: AuthFailure }> {
  if (rateLimit(`register:${input.email}`, 5, AUTH_WINDOW_MS).ok === false) {
    return { ok: false, reason: "RATE_LIMITED" };
  }
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, reason: "INVALID" };
  if (passwordIssues(input.password).length > 0) return { ok: false, reason: "WEAK_PASSWORD" };
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return { ok: false, reason: "EXISTS" };

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(input.password),
      displayName: input.displayName.slice(0, 80),
      role: "DONOR",
      notificationPreference: { create: {} },
    },
  });
  await prisma.consentRecord.create({
    data: {
      subjectType: "DONOR_PLATFORM",
      subjectRef: user.id,
      purposeKey: "account.lifecycle_notifications",
      granted: true,
      policyVersion: "1.0",
    },
  });
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
): Promise<{ ok: true; userId: string; role: string } | { ok: false; reason: AuthFailure }> {
  const key = `login:${email.trim().toLowerCase()}`;
  const rl = rateLimit(key, MAX_AUTH_ATTEMPTS, AUTH_WINDOW_MS);
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
 */
export async function linkDonationToDonor(
  userId: string,
  donorProfileId: string | null,
  linkCode: string
): Promise<{ ok: boolean }> {
  const code = linkCode.trim();
  if (!/^[A-Za-z0-9-]{6,32}$/.test(code)) return { ok: false };
  const donation = await prisma.donation.findUnique({
    where: { linkCode: code },
    include: { organization: { select: { name: true } } },
  });
  if (!donation || donation.linkStatus !== "UNLINKED") return { ok: false };

  let profileId = donorProfileId;
  if (!profileId) {
    const profile = await prisma.donorProfile.create({ data: { userId } });
    profileId = profile.id;
  }
  await prisma.donation.update({
    where: { id: donation.id },
    data: { donorProfileId: profileId, linkStatus: "LINKED" },
  });
  await recordAudit({
    actorType: "USER", actorId: userId, action: "donation.linked",
    resourceType: "Donation", resourceId: donation.id, orgId: donation.organizationId,
  });
  return { ok: true };
}
