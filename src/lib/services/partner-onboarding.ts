import "server-only";
/**
 * Partner onboarding review (PLATFORM_ADMIN only — callers must enforce that).
 * Approving a PartnerRequest provisions the Organization as ACTIVE and issues
 * a one-time OrgInvite for the requester's work email; the plaintext invite
 * token only ever exists in the emailed link (token stored peppered-hashed).
 * NGO requests must be mapped to an operating kind by the reviewing admin.
 */
import { prisma } from "@/packages/database/client";
import { randomToken, hashWithPepper } from "@/lib/crypto";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { enqueueEmailWithImmediateDelivery } from "@/packages/notifications/outbox-worker";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_ROLES = ["ORG_ADMIN", "ORG_STAFF"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];
/** Operating kinds an approved org can take (schema: Organization.kind). */
export const APPROVED_ORG_KINDS = ["BLOOD_BANK", "HOSPITAL", "BLOOD_BANK_AND_HOSPITAL"] as const;
export type ApprovedOrgKind = (typeof APPROVED_ORG_KINDS)[number];

export interface ApproveOutcome {
  ok: true;
  organizationId: string;
  inviteId: string;
}
export type ApproveError =
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_DECIDED" | "INVALID_KIND" };

export async function approvePartnerRequest(
  requestId: string,
  orgKind: ApprovedOrgKind,
  adminUserId: string,
  role: InviteRole = "ORG_ADMIN"
): Promise<ApproveOutcome | ApproveError> {
  if (!APPROVED_ORG_KINDS.includes(orgKind)) return { ok: false, reason: "INVALID_KIND" };
  if (!INVITE_ROLES.includes(role)) return { ok: false, reason: "INVALID_KIND" };

  const request = await prisma.partnerRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, reason: "NOT_FOUND" };
  if (request.status === "APPROVED" || request.status === "REJECTED") {
    return { ok: false, reason: "ALREADY_DECIDED" };
  }

  const regionLabel = [request.city, request.state].filter(Boolean).join(", ") || null;

  const organization = await prisma.organization.create({
    data: {
      name: request.orgName,
      kind: orgKind,
      status: "ACTIVE",
      regionLabel,
    },
  });

  const token = randomToken(32);
  const invite = await prisma.orgInvite.create({
    data: {
      email: request.workEmail.toLowerCase(),
      orgId: organization.id,
      role,
      tokenHash: hashWithPepper(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedById: adminUserId,
    },
  });

  await prisma.partnerRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED" },
  });

  const inviteUrl = `${env.APP_URL}/invite/${encodeURIComponent(token)}`;
  await enqueueEmailWithImmediateDelivery({
    toEmail: request.workEmail,
    subject: `Your RaktSetu organization "${request.orgName}" is approved`,
    bodyText: [
      `Hi ${request.contactName},`,
      "",
      `Your partner request for "${request.orgName}" has been approved.`,
      "Create your organization-admin account with this one-time link:",
      inviteUrl,
      "",
      "The link is valid for 7 days. If it expires, a platform administrator can issue a new one.",
    ].join("\n"),
  });

  await recordAudit({
    actorType: "USER",
    actorId: adminUserId,
    action: "partner.request_approved",
    resourceType: "PartnerRequest",
    resourceId: requestId,
    metadata: {
      organizationId: organization.id,
      orgKind,
      inviteId: invite.id,
      inviteEmail: request.workEmail,
    },
  });

  return { ok: true, organizationId: organization.id, inviteId: invite.id };
}

export type RejectError =
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_DECIDED" | "REASON_REQUIRED" };

export async function rejectPartnerRequest(
  requestId: string,
  reason: string,
  adminUserId: string
): Promise<{ ok: true } | RejectError> {
  const request = await prisma.partnerRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, reason: "NOT_FOUND" };
  if (request.status === "APPROVED" || request.status === "REJECTED") {
    return { ok: false, reason: "ALREADY_DECIDED" };
  }
  if (!reason || reason.trim().length < 4) return { ok: false, reason: "REASON_REQUIRED" };

  await prisma.partnerRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED" },
  });
  await recordAudit({
    actorType: "USER",
    actorId: adminUserId,
    action: "partner.request_rejected",
    resourceType: "PartnerRequest",
    resourceId: requestId,
    metadata: { reason: reason.trim().slice(0, 200) },
  });
  return { ok: true };
}

/** What the /invite/[token] page may render: org name + target email, nothing else. */
export async function getInvitePreview(
  token: string
): Promise<{ valid: true; orgName: string; email: string; role: string } | { valid: false }> {
  const invite = await prisma.orgInvite.findUnique({
    where: { tokenHash: hashWithPepper(token) },
    include: { org: { select: { name: true, status: true } } },
  });
  if (
    !invite ||
    invite.usedAt ||
    invite.expiresAt.getTime() < Date.now() ||
    invite.org.status !== "ACTIVE"
  ) {
    return { valid: false };
  }
  return { valid: true, orgName: invite.org.name, email: invite.email, role: invite.role };
}

/**
 * Accept an invite: prove token ownership, create the user + membership in one
 * transaction, burn the token. Email is trusted because the token arrived at
 * that inbox — emailVerifiedAt is set here.
 */
export async function acceptOrgInvite(
  token: string,
  displayName: string,
  password: string
): Promise<{ ok: true; userId: string; orgId: string } | { ok: false; reason: "INVALID" | "VALIDATION" }> {
  const { hashPassword, passwordIssues } = await import("@/lib/auth/passwords");
  if (!displayName || displayName.trim().length < 2 || displayName.length > 80) {
    return { ok: false, reason: "VALIDATION" };
  }
  const issues = passwordIssues(password);
  if (issues.length > 0) return { ok: false, reason: "VALIDATION" };

  const invite = await prisma.orgInvite.findUnique({
    where: { tokenHash: hashWithPepper(token) },
    include: { org: { select: { id: true, status: true } } },
  });
  if (
    !invite ||
    invite.usedAt ||
    invite.expiresAt.getTime() < Date.now() ||
    invite.org.status !== "ACTIVE"
  ) {
    return { ok: false, reason: "INVALID" };
  }

  const existing = await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } });
  if (existing) return { ok: false, reason: "INVALID" };

  const displayNameTrimmed = displayName.trim();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invite.email,
          passwordHash: hashPassword(password),
          displayName: displayNameTrimmed,
          role: invite.role === "ORG_STAFF" ? "ORG_STAFF" : "ORG_ADMIN",
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });
      await tx.organizationUser.create({
        data: { orgId: invite.orgId, userId: user.id, role: invite.role, status: "ACTIVE" },
      });
      await tx.orgInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
      return user;
    });
    await recordAudit({
      actorType: "USER",
      actorId: result.id,
      action: "partner.invite_accepted",
      resourceType: "OrgInvite",
      resourceId: invite.id,
      orgId: invite.orgId,
    });
    return { ok: true, userId: result.id, orgId: invite.orgId };
  } catch {
    // Race: the email was claimed between check and create — treat as invalid.
    return { ok: false, reason: "INVALID" };
  }
}
