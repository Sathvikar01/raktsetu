import "server-only";
/**
 * Password reset — request/complete halves with no user enumeration on the
 * request path. Tokens are stored hashed (peppered), single-use, 1h expiry.
 * Completing a reset invalidates every existing session for the account.
 */
import { prisma } from "@/packages/database/client";
import { randomToken, hashWithPepper } from "@/lib/crypto";
import { hashPassword, passwordIssues } from "@/lib/auth/passwords";
import { recordAudit } from "@/lib/audit";
import { hashedLimitKey, rateLimitPersistent } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { enqueueEmailWithImmediateDelivery } from "@/packages/notifications/outbox-worker";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const REQUEST_WINDOW_MS = 15 * 60_000;

export type ResetFailure = "INVALID_TOKEN" | "WEAK_PASSWORD";

/** Always returns ok — never reveals whether the account exists. */
export async function requestPasswordReset(email: string, ipHash?: string | null): Promise<{ ok: true }> {
  const normalized = email.trim().toLowerCase();
  // Sensitive auth limit: hashed key (raw email never persisted) + fail closed.
  const rl = await rateLimitPersistent(
    `pwreset:${hashedLimitKey("email", normalized)}`,
    3,
    REQUEST_WINDOW_MS,
    { failClosed: true }
  );
  if (!rl.ok) return { ok: true };

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, displayName: true, status: true },
  });

  if (user && user.status === "ACTIVE") {
    const token = randomToken(32);
    await prisma.$transaction([
      // Only the newest token is valid — stale unused tokens must not pile up.
      prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashWithPepper(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      }),
    ]);
    const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    // Delivered inline; the outbox row exists only so the worker can retry.
    await enqueueEmailWithImmediateDelivery({
      toEmail: normalized,
      subject: "Reset your RaktSetu password",
      bodyText: [
        `Hi ${user.displayName},`,
        "",
        "Someone requested a password reset for your RaktSetu account.",
        `If this was you, open this link within one hour: ${resetUrl}`,
        "",
        "If you did not request this, you can safely ignore this email.",
      ].join("\n"),
    });
    await recordAudit({
      actorType: "SYSTEM",
      action: "password.reset_requested",
      resourceType: "User",
      resourceId: user.id,
      ipHash: ipHash ?? null,
    });
  }
  return { ok: true };
}

export async function resetPassword(
  token: string,
  newPassword: string,
  ipHash?: string | null
): Promise<{ ok: true } | { ok: false; reason: ResetFailure }> {
  if (passwordIssues(newPassword).length > 0) {
    return { ok: false, reason: "WEAK_PASSWORD" };
  }

  const tokenHash = hashWithPepper(token);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "INVALID_TOKEN" };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: hashPassword(newPassword) },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate every session — a reset is a full credential rotation.
    prisma.session.deleteMany({ where: { userId: row.userId } }),
  ]);

  await recordAudit({
    actorType: "USER",
    actorId: row.userId,
    action: "password.reset_completed",
    resourceType: "User",
    resourceId: row.userId,
    ipHash: ipHash ?? null,
  });
  return { ok: true };
}
