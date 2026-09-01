"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getDictionary, LOCALES } from "@/i18n";
import { recordAudit } from "@/lib/audit";
import { logout, linkDonationToDonor } from "@/lib/services/account";
import { clientIpFrom } from "@/lib/rate-limit";
import { can, requireRole } from "@/lib/rbac";
import { CsrfError, requireCsrf } from "@/lib/auth/session";
import { prisma } from "@/packages/database/client";
import { DONOR_CONSENT_PURPOSES, type DonorActionState } from "./types";

/**
 * Donor app server actions. Every action re-checks role (deny-by-default)
 * and permission before touching data; ownership is enforced by scoping
 * every query to the session user's ids (PI-9).
 */

/** Double-submit CSRF guard for authenticated donor mutations (throws CsrfError). */
function assertCsrf(formData: FormData): Promise<void> {
  return requireCsrf(formData);
}

const LinkSchema = z.object({
  linkCode: z.string().trim().regex(/^[A-Za-z0-9-]{6,32}$/),
});

export async function linkDonationAction(
  _prev: DonorActionState | null,
  formData: FormData
): Promise<DonorActionState> {
  const user = await requireRole("DONOR");
  const d = getDictionary();
  try {
    await assertCsrf(formData);
  } catch {
    return { ok: false, message: d.common.errorGeneric };
  }
  const parsed = LinkSchema.safeParse({ linkCode: formData.get("linkCode") });
  if (!parsed.success) return { ok: false, message: d.donor.linkInvalid };

  const h = await headers();
  const result = await linkDonationToDonor(
    user.id,
    user.donorProfileId,
    parsed.data.linkCode,
    clientIpFrom(h)
  );
  if (!result.ok) {
    return {
      ok: false,
      message: result.reason === "RATE_LIMITED" ? d.donor.linkRateLimited : d.donor.linkInvalid,
    };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: d.donor.linkSuccess };
}

export async function signOutDonorAction(formData: FormData): Promise<void> {
  try {
    await assertCsrf(formData);
  } catch {
    redirect("/dashboard");
  }
  await logout();
  redirect("/");
}

export async function markAllNotificationsReadAction(formData: FormData): Promise<void> {
  const user = await requireRole("DONOR");
  try {
    await assertCsrf(formData);
  } catch {
    redirect("/forbidden");
  }
  if (!can(user.role, "notification:write:own")) redirect("/forbidden");
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard/notifications");
}

const PrefsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
  whatsapp: z.boolean(),
  push: z.boolean(),
  descriptiveContent: z.boolean(),
  locale: z.enum([...LOCALES] as [string, ...string[]]),
});

function checkbox(formData: FormData, name: string): boolean {
  const v = formData.get(name);
  return v === "on" || v === "true" || v === "1";
}

export async function saveNotificationPreferencesAction(
  _prev: DonorActionState | null,
  formData: FormData
): Promise<DonorActionState> {
  const user = await requireRole("DONOR");
  const d = getDictionary();
  try {
    await assertCsrf(formData);
  } catch {
    return { ok: false, message: d.common.errorGeneric };
  }
  const parsed = PrefsSchema.safeParse({
    inApp: checkbox(formData, "inApp"),
    email: checkbox(formData, "email"),
    sms: checkbox(formData, "sms"),
    whatsapp: checkbox(formData, "whatsapp"),
    push: checkbox(formData, "push"),
    descriptiveContent: checkbox(formData, "descriptiveContent"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) return { ok: false, message: d.common.errorGeneric };

  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: { ...parsed.data },
  });
  await recordAudit({
    actorType: "USER",
    actorId: user.id,
    action: "profile.preferences_updated",
    resourceType: "User",
    resourceId: user.id,
  });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: d.donor.settingsSaved };
}

const ConsentSchema = z.object({
  purposeKey: z.enum(DONOR_CONSENT_PURPOSES),
  policyVersion: z.string().trim().min(1).max(32).default("1.0"),
});

export async function recordConsentAction(
  _prev: DonorActionState | null,
  formData: FormData
): Promise<DonorActionState> {
  const user = await requireRole("DONOR");
  if (!can(user.role, "consent:write:own")) redirect("/forbidden");
  const d = getDictionary();
  try {
    await assertCsrf(formData);
  } catch {
    return { ok: false, message: d.common.errorGeneric };
  }
  const parsed = ConsentSchema.safeParse({
    purposeKey: formData.get("purposeKey"),
    policyVersion: formData.get("policyVersion") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: d.common.errorGeneric };

  const created = await prisma.consentRecord.create({
    data: {
      subjectType: "DONOR_PLATFORM",
      subjectRef: user.id,
      purposeKey: parsed.data.purposeKey,
      granted: true,
      policyVersion: parsed.data.policyVersion,
    },
    select: { id: true },
  });
  await recordAudit({
    actorType: "USER",
    actorId: user.id,
    action: "consent.recorded",
    resourceType: "ConsentRecord",
    resourceId: created.id,
  });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: d.donor.consentRecorded };
}

export async function revokeConsentAction(formData: FormData): Promise<void> {
  const user = await requireRole("DONOR");
  if (!can(user.role, "consent:write:own")) redirect("/forbidden");
  try {
    await assertCsrf(formData);
  } catch {
    redirect("/forbidden");
  }
  const id = String(formData.get("consentId") ?? "");
  // Append-oriented model: revocation sets revokedAt on the row; never deletes.
  const record = await prisma.consentRecord.findFirst({
    where: { id, subjectType: "DONOR_PLATFORM", subjectRef: user.id, revokedAt: null },
    select: { id: true },
  });
  if (!record) return; // not owned / already revoked — no information leaked
  await prisma.consentRecord.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
  await recordAudit({
    actorType: "USER",
    actorId: user.id,
    action: "consent.revoked",
    resourceType: "ConsentRecord",
    resourceId: record.id,
  });
  revalidatePath("/dashboard/settings");
}
