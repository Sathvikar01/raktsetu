"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { createSession } from "@/lib/auth/session";
import {
  confirmEnrollment,
  readMfaPendingUserId,
  verifyMfaChallenge,
} from "@/lib/services/mfa";
import { prisma } from "@/packages/database/client";

function roleDestination(role: string): string {
  if (role === "ORG_STAFF" || role === "ORG_ADMIN") return "/staff";
  if (role === "PLATFORM_ADMIN") return "/admin";
  return "/dashboard";
}

async function destinationFor(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return roleDestination(user?.role ?? "DONOR");
}

export interface MfaState {
  ok: boolean;
  error?: "invalid" | "expired" | "rate_limited";
}

export async function verifyMfaAction(
  _prev: MfaState | null,
  formData: FormData
): Promise<MfaState> {
  const userId = await readMfaPendingUserId();
  if (!userId) return { ok: false, error: "expired" };

  const code = String(formData.get("code") ?? "");
  const result = await verifyMfaChallenge(userId, code, async (id) => {
    await createSession(id);
    await recordAudit({
      actorType: "USER", actorId: id, action: "session.created",
      resourceType: "User", resourceId: id,
      metadata: { mfa: true },
    });
  });
  if (!result.ok) {
    return { ok: false, error: result.reason === "EXPIRED" ? "expired" : result.reason === "RATE_LIMITED" ? "rate_limited" : "invalid" };
  }
  redirect(await destinationFor(userId));
}

export async function confirmMfaEnrollmentAction(
  _prev: MfaState | null,
  formData: FormData
): Promise<MfaState> {
  const userId = await readMfaPendingUserId();
  if (!userId) return { ok: false, error: "expired" };

  const code = String(formData.get("code") ?? "");
  const result = await confirmEnrollment(userId, code, async (id) => {
    await createSession(id);
    await recordAudit({
      actorType: "USER", actorId: id, action: "mfa.enrolled",
      resourceType: "User", resourceId: id,
    });
    await recordAudit({
      actorType: "USER", actorId: id, action: "session.created",
      resourceType: "User", resourceId: id,
      metadata: { mfa: true },
    });
  });
  if (!result.ok) {
    return { ok: false, error: result.reason === "EXPIRED" ? "expired" : result.reason === "RATE_LIMITED" ? "rate_limited" : "invalid" };
  }
  redirect(await destinationFor(userId));
}
