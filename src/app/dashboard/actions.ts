"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getDictionary, LOCALES } from "@/i18n";
import { recordAudit } from "@/lib/audit";
import { logout, linkDonationToDonor } from "@/lib/services/account";
import { clientIpFrom } from "@/lib/rate-limit";
import { can, ForbiddenError, requireRole } from "@/lib/rbac";
import { CsrfError, requireCsrf, verifyCsrfToken } from "@/lib/auth/session";
import { prisma } from "@/packages/database/client";
import { issueOtp, verifyOtp } from "@/lib/services/otp";
import {
  updateDonorNetworkProfile,
  withdrawFromDonorNetwork,
} from "@/lib/services/donor-network";
import { respondToDonorMatch } from "@/lib/services/emergency-requests";
import { OpsValidationError } from "@/lib/services/bloodbank-ops";
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
  donationReminders: z.boolean(),
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
    donationReminders: checkbox(formData, "donationReminders"),
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

// ---------------------------------------------------------------------------
// Emergency donor network (onboarding, controls, match responses)
// ---------------------------------------------------------------------------

/** Arg-style actions below verify the CSRF cookie token from the client. */
async function donorGate(csrfToken: string): Promise<{ userId: string; donorProfileId: string }> {
  const user = await requireRole("DONOR");
  if (!(await verifyCsrfToken(csrfToken))) throw new CsrfError();
  if (!user.donorProfileId) throw new ForbiddenError();
  return { userId: user.id, donorProfileId: user.donorProfileId };
}

export interface DonorNetworkActionState {
  ok: boolean;
  messageKey?: string;
  devCode?: string;
  verificationToken?: string;
}

export async function requestDonorPhoneOtpAction(
  csrfToken: string,
  phone: string
): Promise<DonorNetworkActionState> {
  try {
    await donorGate(csrfToken);
  } catch {
    return { ok: false, messageKey: "common.errorGeneric" };
  }
  const h = await headers();
  const result = await issueOtp({
    purpose: "DONOR_PHONE",
    phone,
    ip: clientIpFrom(h),
  });
  if (!result.ok) {
    return {
      ok: false,
      messageKey: result.reason === "INVALID_PHONE" ? "emergency.otpInvalidPhone" : "emergency.otpRateLimited",
    };
  }
  return { ok: true, devCode: result.devCode };
}

export async function verifyDonorPhoneOtpAction(
  csrfToken: string,
  phone: string,
  code: string
): Promise<DonorNetworkActionState> {
  try {
    await donorGate(csrfToken);
  } catch {
    return { ok: false, messageKey: "common.errorGeneric" };
  }
  const result = await verifyOtp({ purpose: "DONOR_PHONE", phone, code });
  if (!result.ok || !result.verificationToken) {
    const keys: Record<string, string> = {
      INVALID: "emergency.otpInvalid",
      EXPIRED: "emergency.otpExpired",
      LOCKED: "emergency.otpLocked",
      NOT_FOUND: "emergency.otpNotFound",
    };
    return { ok: false, messageKey: keys[result.reason ?? "INVALID"] ?? "emergency.otpInvalid" };
  }
  return { ok: true, verificationToken: result.verificationToken };
}

export interface DonorNetworkProfileInput {
  csrfToken: string;
  bloodGroup?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string | null;
  available?: boolean;
  notifyRadiusKm?: number;
  lastDonationDate?: string | null;
  phone?: string | null;
  phoneVerificationToken?: string | null;
}

export async function saveDonorNetworkProfileAction(
  input: DonorNetworkProfileInput
): Promise<DonorNetworkActionState> {
  let userId: string;
  let donorProfileId: string;
  try {
    ({ userId, donorProfileId } = await donorGate(input.csrfToken));
  } catch {
    return { ok: false, messageKey: "common.errorGeneric" };
  }
  try {
    await updateDonorNetworkProfile({
      userId,
      donorProfileId,
      bloodGroup: input.bloodGroup ?? undefined,
      latitude: input.latitude ?? undefined,
      longitude: input.longitude ?? undefined,
      locationLabel: input.locationLabel,
      available: input.available,
      notifyRadiusKm: input.notifyRadiusKm,
      lastDonationAt: input.lastDonationDate ? new Date(input.lastDonationDate) : undefined,
      phone: input.phone || undefined,
      phoneVerificationToken: input.phoneVerificationToken || undefined,
    });
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { ok: true, messageKey: "donor.networkSaved" };
  } catch (err) {
    if (err instanceof OpsValidationError && err.message === "PHONE_NOT_VERIFIED") {
      return { ok: false, messageKey: "donor.networkPhoneNotVerified" };
    }
    return { ok: false, messageKey: "common.errorGeneric" };
  }
}

export async function withdrawFromDonorNetworkAction(csrfToken: string): Promise<DonorNetworkActionState> {
  let userId: string;
  let donorProfileId: string;
  try {
    ({ userId, donorProfileId } = await donorGate(csrfToken));
  } catch {
    return { ok: false, messageKey: "common.errorGeneric" };
  }
  await withdrawFromDonorNetwork(userId, donorProfileId);
  revalidatePath("/dashboard/settings");
  return { ok: true, messageKey: "donor.networkWithdrawn" };
}

export async function respondToDonorMatchAction(
  csrfToken: string,
  matchId: string,
  accept: boolean
): Promise<DonorNetworkActionState> {
  let donorProfileId: string;
  try {
    ({ donorProfileId } = await donorGate(csrfToken));
  } catch {
    return { ok: false, messageKey: "common.errorGeneric" };
  }
  if (!can("DONOR", "match:respond:own")) return { ok: false, messageKey: "common.forbiddenTitle" };
  const result = await respondToDonorMatch({ donorProfileId, matchId, accept });
  revalidatePath("/dashboard/requests");
  if (!result.ok) return { ok: false, messageKey: "common.errorGeneric" };
  return { ok: true, messageKey: accept ? "donor.matchAccepted" : "donor.matchDeclined" };
}
