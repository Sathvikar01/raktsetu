import "server-only";
/**
 * Email verification.
 * - Verification emails are delivered inline (outbox row kept for retry by
 *   the worker — Resend/console).
 * - Staff/admin roles REQUIRE a verified email to sign in; donors are nudged
 *   but not blocked (verification proves channel reachability, not identity).
 */
import { prisma } from "@/packages/database/client";
import { randomToken, hashWithPepper } from "@/lib/crypto";
import { recordAudit } from "@/lib/audit";
import { rateLimitPersistent } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { enqueueEmailWithImmediateDelivery } from "@/packages/notifications/outbox-worker";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function issueEmailVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, displayName: true, emailVerifiedAt: true },
  });
  if (!user || user.emailVerifiedAt) return;

  // Replace any outstanding token — one live link at a time.
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });
  const token = randomToken(32);
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hashWithPepper(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  const verifyUrl = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  // Delivered inline; the outbox row exists only so the worker can retry.
  await enqueueEmailWithImmediateDelivery({
    toEmail: user.email,
    subject: "Verify your RaktSetu email",
    bodyText: [
      `Hi ${user.displayName},`,
      "",
      "Confirm this email address for your RaktSetu account:",
      verifyUrl,
      "",
      "The link is valid for 24 hours.",
    ].join("\n"),
  });
  await recordAudit({
    actorType: "SYSTEM",
    action: "email.verification_requested",
    resourceType: "User",
    resourceId: userId,
  });
}

/** Re-issue with rate limiting for the "resend" action from the app. */
export async function resendEmailVerification(
  userId: string
): Promise<{ ok: boolean; message?: string }> {
  const rl = await rateLimitPersistent(`verify-resend:${userId}`, 3, 15 * 60_000, {
    failClosed: true,
  });
  if (!rl.ok) return { ok: false, message: "RATE_LIMITED" };
  await issueEmailVerification(userId);
  return { ok: true };
}

export async function verifyEmail(
  token: string
): Promise<{ ok: true } | { ok: false }> {
  const tokenHash = hashWithPepper(token);
  const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return { ok: false };
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.emailVerificationToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);
  await recordAudit({
    actorType: "USER",
    actorId: row.userId,
    action: "email.verified",
    resourceType: "User",
    resourceId: row.userId,
  });
  return { ok: true };
}
