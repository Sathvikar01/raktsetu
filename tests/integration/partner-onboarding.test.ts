/**
 * Partner onboarding loop (through the real services): a PENDING PartnerRequest
 * is approved -> Organization provisioned ACTIVE + OrgInvite emailed -> the
 * requester accepts the invite and becomes a verified ORG_ADMIN with a
 * membership. Covers the reject path and all the guard rails.
 * Runs against a throwaway sqlite DB created before prisma is imported.
 */
process.env.DATABASE_URL = "file:./test-onboarding.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-onboarding.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-onboarding.db");

let prisma: Db;
let approvePartnerRequest: (typeof import("@/lib/services/partner-onboarding"))["approvePartnerRequest"];
let rejectPartnerRequest: (typeof import("@/lib/services/partner-onboarding"))["rejectPartnerRequest"];
let acceptOrgInvite: (typeof import("@/lib/services/partner-onboarding"))["acceptOrgInvite"];
let getInvitePreview: (typeof import("@/lib/services/partner-onboarding"))["getInvitePreview"];

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";

let prRequestId: string;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  const onboarding = await import("@/lib/services/partner-onboarding");
  ({
    approvePartnerRequest,
    rejectPartnerRequest,
    acceptOrgInvite,
    getInvitePreview,
  } = onboarding);

  const request = await prisma.partnerRequest.create({
    data: {
      orgName: "Hope Blood Centre",
      orgKind: "NGO",
      contactName: "Dr Onboarding",
      workEmail: "admin@hopeblood.test",
      city: "Pune",
      state: "Maharashtra",
      message: "We run three collection drives a month.",
    },
  });
  prRequestId = request.id;
});

afterAll(async () => {
  const tables = [
    "auditLog", "notification", "notificationPreference", "outboxEmail",
    "orgInvite", "requestFulfillment", "bloodRequest",
    "integrationEvent", "integrationCredential", "integration",
    "disclosureDecision", "disclosureConsent", "recipientContext",
    "lifecycleEvent", "bloodComponent", "externalIdentifier",
    "donation", "facility", "donorProfile", "consentRecord", "user", "organization",
    "partnerRequest", "emailVerificationToken", "passwordResetToken", "session",
    "rateLimitBucket",
  ] as const;
  for (const table of tables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any)[table].deleteMany({});
    } catch {
      // best-effort cleanup
    }
  }
  await prisma.$disconnect();
  try {
    rmSync(DB_FILE, { force: true });
  } catch {
    // file may still be locked on Windows — best effort
  }
});

describe("partner onboarding", () => {
  it("approves a request: org provisioned ACTIVE, invite queued by email, request APPROVED", async () => {
    const outcome = await approvePartnerRequest(prRequestId, "BLOOD_BANK", ADMIN_ID);
    if (!outcome.ok) throw new Error(`approve failed: ${outcome.reason}`);

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: outcome.organizationId },
    });
    expect(org.status).toBe("ACTIVE");
    expect(org.regionLabel).toBe("Pune, Maharashtra");

    const invite = await prisma.orgInvite.findUniqueOrThrow({
      where: { id: outcome.inviteId },
    });
    expect(invite.email).toBe("admin@hopeblood.test");
    expect(invite.role).toBe("ORG_ADMIN");
    expect(invite.usedAt).toBeNull();

    const email = await prisma.outboxEmail.findFirst({
      where: { toEmail: "admin@hopeblood.test" },
      orderBy: { createdAt: "desc" },
    });
    expect(email?.bodyText).toContain("/invite/");

    const request = await prisma.partnerRequest.findUniqueOrThrow({ where: { id: prRequestId } });
    expect(request.status).toBe("APPROVED");

    await expect(approvePartnerRequest(prRequestId, "BLOOD_BANK", ADMIN_ID)).resolves.toMatchObject({
      ok: false,
      reason: "ALREADY_DECIDED",
    });
  });

  it("rejects invalid approvals: unknown kinds and unknown requests", async () => {
    // Kind validation fires before the decided check.
    await expect(
      approvePartnerRequest(prRequestId, "NGO" as never, ADMIN_ID)
    ).resolves.toMatchObject({ ok: false, reason: "INVALID_KIND" });
    await expect(
      approvePartnerRequest("00000000-0000-4000-8000-00000000dead", "BLOOD_BANK", ADMIN_ID)
    ).resolves.toMatchObject({ ok: false, reason: "NOT_FOUND" });
  });

  it("accepts a valid invite into a verified org admin, then burns the token", async () => {
    const second = await prisma.partnerRequest.create({
      data: {
        orgName: "River Hospital",
        orgKind: "HOSPITAL",
        contactName: "Ms River",
        workEmail: "admin@riverhospital.test",
      },
    });
    const approved = await approvePartnerRequest(second.id, "HOSPITAL", ADMIN_ID);
    if (!approved.ok) throw new Error(`approve failed: ${approved.reason}`);

    // The plaintext token is unknowable by design — mint a known-token invite
    // through the same hashing path to exercise acceptance.
    const { randomToken, hashWithPepper } = await import("@/lib/crypto");
    const token = randomToken(32);
    const invite2 = await prisma.orgInvite.create({
      data: {
        email: "second@riverhospital.test",
        orgId: approved.organizationId,
        role: "ORG_ADMIN",
        tokenHash: hashWithPepper(token),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedById: ADMIN_ID,
      },
    });

    const preview = await getInvitePreview(token);
    expect(preview.valid).toBe(true);
    if (preview.valid) {
      expect(preview.orgName).toBe("River Hospital");
    }

    const weak = await acceptOrgInvite(token, "River Admin", "short");
    expect(weak).toMatchObject({ ok: false, reason: "VALIDATION" });

    const accepted = await acceptOrgInvite(token, "River Admin", "river-secure-pass-1");
    expect(accepted.ok).toBe(true);

    if (accepted.ok) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: accepted.userId } });
      expect(user.role).toBe("ORG_ADMIN");
      expect(user.emailVerifiedAt).not.toBeNull();
      const membership = await prisma.organizationUser.findFirstOrThrow({
        where: { userId: user.id, orgId: accepted.orgId },
      });
      expect(membership.role).toBe("ORG_ADMIN");
    }

    const burned = await prisma.orgInvite.findUniqueOrThrow({ where: { id: invite2.id } });
    expect(burned.usedAt).not.toBeNull();
    await expect(acceptOrgInvite(token, "Again", "river-secure-pass-1")).resolves.toMatchObject({
      ok: false,
      reason: "INVALID",
    });
  });

  it("rejects a request with a reason and guards short reasons", async () => {
    const request = await prisma.partnerRequest.create({
      data: {
        orgName: "Reject Centre",
        orgKind: "BLOOD_BANK",
        contactName: "Ms Reject",
        workEmail: "reject@centre.test",
      },
    });
    await expect(rejectPartnerRequest(request.id, "no", ADMIN_ID)).resolves.toMatchObject({
      ok: false,
      reason: "REASON_REQUIRED",
    });
    await expect(
      rejectPartnerRequest(request.id, "duplicate of an existing partner", ADMIN_ID)
    ).resolves.toMatchObject({ ok: true });
    const decided = await prisma.partnerRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(decided.status).toBe("REJECTED");
    await expect(
      rejectPartnerRequest(request.id, "second rejection attempt", ADMIN_ID)
    ).resolves.toMatchObject({ ok: false, reason: "ALREADY_DECIDED" });
  });
});
