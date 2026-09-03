"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDictionary } from "@/i18n";
import { can, requireRole } from "@/lib/rbac";
import { CsrfError, requireCsrf, verifyCsrfToken } from "@/lib/auth/session";
import { prisma } from "@/packages/database/client";
import { recordAudit } from "@/lib/audit";
import { logout } from "@/lib/services/account";
import {
  approvePartnerRequest,
  rejectPartnerRequest,
} from "@/lib/services/partner-onboarding";
import {
  approveCamp,
  rejectCamp,
} from "@/lib/services/camps";
import { setEmergencyModeration } from "@/lib/services/emergency-requests";
import {
  createIntegrationWithCredential,
  ProvisioningNotFoundError,
  revokeCredential,
  rotateCredential,
} from "@/lib/services/provisioning";
import type { AdminActionState } from "./types";
import { ADAPTER_TYPES } from "./types";
import { adminFailure, canManageIntegrations, gateAdminMembership, str } from "./shared";

/**
 * Admin portal server actions. Deny-by-default: every action runs
 * requireRole(...) + ACTIVE-membership org gate + permission check.
 */

async function integrationGate(orgId: string): Promise<true> {
  const user = await requireRole("ORG_ADMIN", "PLATFORM_ADMIN");
  if (!(await gateAdminMembership(orgId))) throw new ProvisioningNotFoundError();
  if (!canManageIntegrations(user)) throw new ProvisioningNotFoundError();
  return true;
}

/** Verify the credential belongs to an integration of the given org (no cross-tenant leakage). */
async function assertCredentialInOrg(orgId: string, credentialId: string): Promise<void> {
  const credential = await prisma.integrationCredential.findUnique({
    where: { id: credentialId },
    select: { integration: { select: { orgId: true } } },
  });
  if (!credential || credential.integration.orgId !== orgId) throw new ProvisioningNotFoundError();
}

export async function createIntegrationAction(
  _prev: AdminActionState | null,
  formData: FormData
): Promise<AdminActionState> {
  const organizationId = str(formData, "organizationId");
  try {
    await requireCsrf(formData); // CsrfError → generic admin failure
    await integrationGate(organizationId);
  } catch (err) {
    return adminFailure(err);
  }
  try {
    const input = z
      .object({
        name: z.string().trim().min(1).max(80),
        adapterType: z.enum(ADAPTER_TYPES),
        description: z.string().trim().max(200),
      })
      .safeParse({
        name: formData.get("name"),
        adapterType: formData.get("adapterType"),
        description: formData.get("description") ?? "",
      });
    if (!input.success) {
      return { ok: false, message: getDictionary().admin.errValidation };
    }
    const result = await createIntegrationWithCredential(
      organizationId,
      input.data.name,
      input.data.adapterType,
      input.data.description || null
    );
    revalidatePath("/admin");
    return {
      ok: true,
      message: getDictionary().admin.integrationCreatedTitle,
      secretOnce: {
        keyId: result.credential.keyId,
        secret: result.credential.secret,
      },
    };
  } catch (err) {
    return adminFailure(err);
  }
}

export async function rotateIntegrationCredentialAction(
  organizationId: string,
  credentialId: string,
  csrfToken: string
): Promise<AdminActionState> {
  const d = getDictionary();
  try {
    if (!(await verifyCsrfToken(csrfToken))) throw new CsrfError();
    await integrationGate(organizationId);
  } catch (err) {
    return adminFailure(err);
  }
  try {
    if (!z.string().uuid().safeParse(credentialId).success) throw new ProvisioningNotFoundError();
    await assertCredentialInOrg(organizationId, credentialId);
    const rotated = await rotateCredential(credentialId);
    revalidatePath("/admin");
    return {
      ok: true,
      message: d.admin.rotateDoneTitle,
      secretOnce: {
        keyId: rotated.keyId,
        secret: rotated.secret,
        previousKeyId: rotated.previousKeyId,
      },
    };
  } catch (err) {
    return adminFailure(err);
  }
}

export async function revokeIntegrationCredentialAction(
  organizationId: string,
  credentialId: string,
  reason: string,
  csrfToken: string
): Promise<AdminActionState> {
  const d = getDictionary();
  try {
    if (!(await verifyCsrfToken(csrfToken))) throw new CsrfError();
    await integrationGate(organizationId);
  } catch (err) {
    return adminFailure(err);
  }
  try {
    if (!z.string().uuid().safeParse(credentialId).success) throw new ProvisioningNotFoundError();
    await assertCredentialInOrg(organizationId, credentialId);
    const cleanReason = (reason ?? "").trim().slice(0, 200);
    if (cleanReason.length < 4) return { ok: false, message: d.admin.errReasonRequired };
    await revokeCredential(credentialId, cleanReason);
    revalidatePath("/admin");
    return { ok: true, message: d.admin.revokeDone };
  } catch (err) {
    return adminFailure(err);
  }
}

// ---------------------------------------------------------------------------
// Platform administration (PLATFORM_ADMIN only)
// ---------------------------------------------------------------------------

export async function setOrgStatusAction(formData: FormData): Promise<void> {
  const user = await requireRole("PLATFORM_ADMIN"); // redirects others to /forbidden
  if (!can(user.role, "org:manage")) redirect("/forbidden");
  try {
    await requireCsrf(formData);
  } catch {
    redirect("/forbidden");
  }

  const orgId = str(formData, "orgId");
  const target = str(formData, "target");
  const reason = str(formData, "reason").trim().slice(0, 200);
  const parsedTarget = z.enum(["ACTIVE", "SUSPENDED"]).safeParse(target);
  const parsedOrgId = z.string().uuid().safeParse(orgId);
  if (!parsedTarget.success || !parsedOrgId.success || reason.length < 4) {
    redirect("/admin/platform?error=reason_required");
  }

  const org = await prisma.organization.findUnique({
    where: { id: parsedOrgId.data },
    select: { id: true, status: true },
  });
  if (!org || org.status === parsedTarget.data) redirect("/admin/platform");

  await prisma.organization.update({
    where: { id: org.id },
    data: { status: parsedTarget.data },
  });
  await recordAudit({
    actorType: "USER",
    actorId: user.id,
    action: "platform.organization.status_changed",
    resourceType: "Organization",
    resourceId: org.id,
    metadata: { from: org.status, to: parsedTarget.data, reason },
  });
  revalidatePath("/admin/platform");
}

// ---------------------------------------------------------------------------
// Partner onboarding review (PLATFORM_ADMIN only)
// ---------------------------------------------------------------------------

export async function approvePartnerRequestAction(formData: FormData): Promise<void> {
  const user = await requireRole("PLATFORM_ADMIN");
  if (!can(user.role, "org:manage")) redirect("/forbidden");
  try {
    await requireCsrf(formData);
  } catch {
    redirect("/forbidden");
  }
  const requestId = z.string().uuid().safeParse(str(formData, "requestId"));
  const orgKind = z
    .enum(["BLOOD_BANK", "HOSPITAL", "BLOOD_BANK_AND_HOSPITAL"])
    .safeParse(str(formData, "orgKind") || "BLOOD_BANK");
  if (!requestId.success || !orgKind.success) {
    redirect("/admin/platform?error=partner_invalid");
  }
  const outcome = await approvePartnerRequest(requestId.data, orgKind.data, user.id);
  if (!outcome.ok) redirect("/admin/platform?error=partner_state");
  revalidatePath("/admin/platform");
}

export async function rejectPartnerRequestAction(formData: FormData): Promise<void> {
  const user = await requireRole("PLATFORM_ADMIN");
  if (!can(user.role, "org:manage")) redirect("/forbidden");
  try {
    await requireCsrf(formData);
  } catch {
    redirect("/forbidden");
  }
  const requestId = z.string().uuid().safeParse(str(formData, "requestId"));
  const reason = str(formData, "reason");
  if (!requestId.success || reason.length < 4) {
    redirect("/admin/platform?error=reason_required");
  }
  const outcome = await rejectPartnerRequest(requestId.data, reason, user.id);
  if (!outcome.ok) redirect("/admin/platform?error=partner_state");
  revalidatePath("/admin/platform");
}

// ---------------------------------------------------------------------------
// Camp verification + emergency moderation (PLATFORM_ADMIN only)
// ---------------------------------------------------------------------------

export async function approveCampAction(formData: FormData): Promise<void> {
  const user = await requireRole("PLATFORM_ADMIN");
  if (!can(user.role, "camp:moderate")) redirect("/forbidden");
  try {
    await requireCsrf(formData);
  } catch {
    redirect("/forbidden");
  }
  const campId = z.string().uuid().safeParse(str(formData, "campId"));
  if (!campId.success) redirect("/admin/platform?error=partner_invalid");
  try {
    await approveCamp(campId.data, user.id);
  } catch {
    redirect("/admin/platform?error=camp_state");
  }
  revalidatePath("/admin/platform");
  revalidatePath("/camps");
}

export async function rejectCampAction(formData: FormData): Promise<void> {
  const user = await requireRole("PLATFORM_ADMIN");
  if (!can(user.role, "camp:moderate")) redirect("/forbidden");
  try {
    await requireCsrf(formData);
  } catch {
    redirect("/forbidden");
  }
  const campId = z.string().uuid().safeParse(str(formData, "campId"));
  const reason = str(formData, "reason");
  if (!campId.success || reason.length < 4) redirect("/admin/platform?error=reason_required");
  try {
    await rejectCamp(campId.data, user.id, reason);
  } catch {
    redirect("/admin/platform?error=camp_state");
  }
  revalidatePath("/admin/platform");
  revalidatePath("/camps");
}

export async function setEmergencyModerationAction(formData: FormData): Promise<void> {
  const user = await requireRole("PLATFORM_ADMIN");
  if (!can(user.role, "emergency:moderate")) redirect("/forbidden");
  try {
    await requireCsrf(formData);
  } catch {
    redirect("/forbidden");
  }
  const requestId = z.string().uuid().safeParse(str(formData, "requestId"));
  const block = str(formData, "block") === "true";
  const reason = str(formData, "reason");
  if (!requestId.success) redirect("/admin/platform?error=partner_invalid");
  if (block && reason.length < 4) redirect("/admin/platform?error=reason_required");
  await setEmergencyModeration({
    requestId: requestId.data,
    moderatorId: user.id,
    block,
    reason: reason || undefined,
  });
  revalidatePath("/admin/platform");
}

export async function signOutAdminAction(formData: FormData): Promise<void> {
  try {
    await requireCsrf(formData);
  } catch {
    redirect("/admin");
  }
  await logout();
  redirect("/");
}
