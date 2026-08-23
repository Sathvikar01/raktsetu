/**
 * Core end-to-end journey through the real services (no HTTP layer):
 * two orgs + facilities, credential provisioning on both sides, donor
 * registration, recordDonation -> link -> 3 components -> transfer ->
 * receive -> transfuse with a disclosure request. Asserts derived state,
 * DisclosureDecision provenance, donor notification, audit trail and the
 * negative authorization path.
 * Runs against a throwaway sqlite DB created before prisma is imported.
 */
process.env.DATABASE_URL = "file:./test-journey.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-journey.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-journey.db");

let prisma: Db;
let createIntegrationWithCredential: (typeof import("@/lib/services/provisioning"))["createIntegrationWithCredential"];
let recordDonation: (typeof import("@/lib/services/bloodbank-ops"))["recordDonation"];
let completeProcessing: (typeof import("@/lib/services/bloodbank-ops"))["completeProcessing"];
let createComponents: (typeof import("@/lib/services/bloodbank-ops"))["createComponents"];
let transferComponent: (typeof import("@/lib/services/bloodbank-ops"))["transferComponent"];
let receiveComponent: (typeof import("@/lib/services/hospital-ops"))["receiveComponent"];
let transfuseComponent: (typeof import("@/lib/services/hospital-ops"))["transfuseComponent"];
let IngestAuthzError: (typeof import("@/lib/services/ingest"))["IngestAuthzError"];

interface World {
  bbOrgId: string;
  hospOrgId: string;
  donorUserId: string;
  donorProfileId: string;
  donationId: string;
  linkCode: string;
  componentIds: { RBC: string; PLASMA: string; PLATELET: string };
}

let world: World;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  const ingestMod = await import("@/lib/services/ingest");
  IngestAuthzError = ingestMod.IngestAuthzError;
  const provisioning = await import("@/lib/services/provisioning");
  ({ createIntegrationWithCredential } = provisioning);
  const bbOps = await import("@/lib/services/bloodbank-ops");
  ({ recordDonation, completeProcessing, createComponents, transferComponent } = bbOps);
  const hOps = await import("@/lib/services/hospital-ops");
  ({ receiveComponent, transfuseComponent } = hOps);
});

afterAll(async () => {
  const tables = [
    "auditLog",
    "notification",
    "notificationPreference",
    "outboxEmail",
    "integrationEvent",
    "integrationCredential",
    "integration",
    "disclosureDecision",
    "disclosureConsent",
    "recipientContext",
    "lifecycleEvent",
    "bloodComponent",
    "externalIdentifier",
    "donation",
    "facility",
    "donorProfile",
    "consentRecord",
    "user",
    "organization",
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

async function buildWorld(): Promise<void> {
  const bbOrg = await prisma.organization.create({
    data: {
      name: "Journey Blood Centre",
      kind: "BLOOD_BANK",
      status: "ACTIVE",
      facilities: { create: { name: "Main Lab", code: "LAB-01", kind: "PROCESSING_LAB" } },
    },
  });
  const hospOrg = await prisma.organization.create({
    data: {
      name: "City General Hospital",
      kind: "HOSPITAL",
      status: "ACTIVE",
      facilities: {
        create: { name: "Main Campus", code: "MAIN", externalCode: "CGH-MAIN", kind: "HOSPITAL" },
      },
    },
  });
  const donor = await prisma.user.create({
    data: {
      email: "journey-donor@test.local",
      passwordHash: "not-a-real-hash",
      displayName: "Journey Donor",
      role: "DONOR",
    },
  });
  const profile = await prisma.donorProfile.create({ data: { userId: donor.id, bloodGroup: "O+" } });

  world = {
    bbOrgId: bbOrg.id,
    hospOrgId: hospOrg.id,
    donorUserId: donor.id,
    donorProfileId: profile.id,
    donationId: "",
    linkCode: "",
    componentIds: { RBC: "", PLASMA: "", PLATELET: "" },
  };
}

describe("core donation-to-transfusion journey (through services)", () => {
  it("provisions ACTIVE credentials on both sides with encrypted secrets at rest", async () => {
    await buildWorld();
    const bb = await createIntegrationWithCredential(
      world.bbOrgId,
      "BB LIS Integration",
      "MOCK_BLOOD_BANK"
    );
    const hosp = await createIntegrationWithCredential(
      world.hospOrgId,
      "Hospital HIS Integration",
      "MOCK_HOSPITAL"
    );
    expect(bb.credential.keyId).toMatch(/^rk_/);
    expect(hosp.credential.keyId).toMatch(/^rk_/);
    expect(bb.credential.secret.length).toBeGreaterThanOrEqual(32);
    expect(hosp.credential.secret).not.toBe("");
    const stored = await prisma.integrationCredential.findUnique({
      where: { keyId: bb.credential.keyId },
    });
    expect(stored?.secretEncrypted).toBeTruthy();
    expect(stored?.secretEncrypted).not.toContain(bb.credential.secret);
    expect(stored?.status).toBe("ACTIVE");
  });

  it("records a donation, issues a link code, and links the donor", async () => {
    const recorded = await recordDonation({
      organizationId: world.bbOrgId,
      externalDonationId: "JB-1001",
      din: "W260010009",
      donatedAt: new Date(),
    });
    expect(recorded.donationId).toBeTruthy();
    expect(recorded.linkCode).toMatch(/^[A-Za-z0-9_-]{6,32}$/);

    const before = await prisma.donation.findUniqueOrThrow({ where: { id: recorded.donationId } });
    expect(before.linkStatus).toBe("UNLINKED");

    world.donationId = recorded.donationId;
    world.linkCode = recorded.linkCode;

    await prisma.donation.update({
      where: { id: recorded.donationId },
      data: { donorProfileId: world.donorProfileId, linkStatus: "LINKED" },
    });
    const after = await prisma.donation.findUniqueOrThrow({ where: { id: recorded.donationId } });
    expect(after.linkStatus).toBe("LINKED");
    expect(after.din).toBe("W260010009");
  });

  it("completes processing + screening and creates three components", async () => {
    const processing = await completeProcessing({
      organizationId: world.bbOrgId,
      donationId: world.donationId,
    });
    expect(processing.processingEventId).not.toBe(processing.screeningEventId);

    const created = await createComponents({
      organizationId: world.bbOrgId,
      donationId: world.donationId,
      components: [
        { componentType: "RBC", externalComponentId: "JB-1001-RBC" },
        { componentType: "PLASMA", externalComponentId: "JB-1001-PLASMA" },
        { componentType: "PLATELET", externalComponentId: "JB-1001-PLATELET" },
      ],
    });
    expect(created.componentIds).toHaveLength(3);
    world.componentIds = {
      RBC: created.componentIds[0]!,
      PLASMA: created.componentIds[1]!,
      PLATELET: created.componentIds[2]!,
    };

    const rbc = await prisma.bloodComponent.findUniqueOrThrow({ where: { id: world.componentIds.RBC } });
    expect(rbc.currentDerivedState).toBe("AVAILABLE");
  });

  it("transfers, receives and transfuses RBC with BROAD_PURPOSE disclosure + provenance", async () => {
    const transfer = await transferComponent({
      organizationId: world.bbOrgId,
      componentId: world.componentIds.RBC,
      destinationFacilityExternalCode: "CGH-MAIN",
    });
    expect(transfer.status).toBe("ACCEPTED");

    const received = await receiveComponent({
      organizationId: world.hospOrgId,
      componentId: world.componentIds.RBC,
    });
    expect(received.status).toBe("ACCEPTED");

    const transfused = await transfuseComponent({
      organizationId: world.hospOrgId,
      componentId: world.componentIds.RBC,
      disclosure: {
        level: "BROAD_PURPOSE",
        category: "EMERGENCY_CARE",
        recipient_ref: "anon-ref-0001",
        patient_consent_verified: true,
      },
    });
    expect(transfused.status).toBe("ACCEPTED");
    expect(transfused.disclosureGrantedLevel).toBe("BROAD_PURPOSE");
    expect(transfused.notificationCreated).toBe(true);

    const rbc = await prisma.bloodComponent.findUniqueOrThrow({
      where: { id: world.componentIds.RBC },
    });
    expect(rbc.currentDerivedState).toBe("TRANSFUSED");

    const decision = await prisma.disclosureDecision.findFirstOrThrow({
      where: { eventId: transfused.lifecycleEventId },
    });
    expect(decision.requestedLevel).toBe("BROAD_PURPOSE");
    expect(decision.grantedLevel).toBe("BROAD_PURPOSE");
    expect(decision.degradedReason).toBeNull();
    const provenance = JSON.parse(decision.provenanceJson);
    expect(provenance.chain).toEqual([
      "DisclosureDecision",
      "LifecycleEvent",
      "Organization",
    ]);
    expect(provenance.eventId).toBe(transfused.lifecycleEventId);
    expect(typeof provenance.organizationId).toBe("string");
    expect(provenance.organizationName).toEqual(expect.any(String));
    expect(typeof provenance.sourceSystem).toBe("string");
    expect(typeof provenance.sourceEventId).toBe("string");

    const notification = await prisma.notification.findFirst({
      where: { userId: world.donorUserId, relatedComponentId: world.componentIds.RBC },
    });
    expect(notification).not.toBeNull();
    expect(notification!.genericTitle).toBe(true);

    const audits = await prisma.auditLog.findMany({ where: { action: "event.ingested" } });
    expect(audits.length).toBeGreaterThanOrEqual(6);
  });

  it("rejects a hospital acting on a component owned by an unrelated blood bank", async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: "Unrelated Blood Centre",
        kind: "BLOOD_BANK",
        status: "ACTIVE",
        facilities: { create: { name: "Lab", code: "LAB-99", kind: "PROCESSING_LAB" } },
      },
    });
    const donation = await recordDonation({
      organizationId: otherOrg.id,
      externalDonationId: "UB-2001",
      donatedAt: new Date(),
    });
    await completeProcessing({ organizationId: otherOrg.id, donationId: donation.donationId });
    const created = await createComponents({
      organizationId: otherOrg.id,
      donationId: donation.donationId,
      components: [{ componentType: "RBC", externalComponentId: "UB-2001-RBC" }],
    });

    await expect(
      receiveComponent({ organizationId: world.hospOrgId, componentId: created.componentIds[0]! })
    ).rejects.toThrow(IngestAuthzError);
  });
});
