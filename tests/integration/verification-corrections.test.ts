/**
 * Regression coverage for the verification/attribution/corrections hardening:
 * 1. PI-6: a PENDING transfusion must NEVER produce a disclosure decision or
 *    donor notification (and the ingest result must not claim it did).
 * 2. Consent/context attribution: the INGESTING hospital is recorded as the
 *    verifying organization — never the blood bank that owns the donation.
 * 3. Corrections: a corrected event is marked supersededByCorrection, drops
 *    out of community stats and no longer authorizes a hospital.
 * Runs against a throwaway sqlite DB created before prisma is imported.
 */
process.env.DATABASE_URL = "file:./test-verify.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-verify.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-verify.db");

let prisma: Db;
let ingestEvent: (typeof import("@/lib/services/ingest"))["ingestEvent"];
let IngestAuthzError: (typeof import("@/lib/services/ingest"))["IngestAuthzError"];
let recordDonation: (typeof import("@/lib/services/bloodbank-ops"))["recordDonation"];
let completeProcessing: (typeof import("@/lib/services/bloodbank-ops"))["completeProcessing"];
let createComponents: (typeof import("@/lib/services/bloodbank-ops"))["createComponents"];
let transferComponent: (typeof import("@/lib/services/bloodbank-ops"))["transferComponent"];
let receiveComponent: (typeof import("@/lib/services/hospital-ops"))["receiveComponent"];

interface World {
  bbOrgId: string;
  bbSourceSystem: string;
  hospOrgId: string;
  hospSourceSystem: string;
  donorUserId: string;
  rbcId: string;
  plasmaId: string;
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
  ({ ingestEvent, IngestAuthzError } = ingestMod);
  const bbOps = await import("@/lib/services/bloodbank-ops");
  ({ recordDonation, completeProcessing, createComponents, transferComponent } = bbOps);
  const hOps = await import("@/lib/services/hospital-ops");
  ({ receiveComponent } = hOps);

  const bbOrg = await prisma.organization.create({
    data: {
      name: "Verify Blood Centre",
      kind: "BLOOD_BANK",
      status: "ACTIVE",
      facilities: { create: { name: "Lab", code: "VLAB-01", kind: "PROCESSING_LAB" } },
    },
  });
  const hospOrg = await prisma.organization.create({
    data: {
      name: "Verify General Hospital",
      kind: "HOSPITAL",
      status: "ACTIVE",
      facilities: {
        create: { name: "Campus", code: "VMAIN", externalCode: "VGH-MAIN", kind: "HOSPITAL" },
      },
    },
  });
  const donor = await prisma.user.create({
    data: {
      email: "verify-donor@test.local",
      passwordHash: "not-a-real-hash",
      displayName: "Verify Donor",
      role: "DONOR",
      notificationPreference: { create: {} },
      donorProfile: { create: {} },
    },
  });
  const donation = await recordDonation({ organizationId: bbOrg.id, externalDonationId: "UB-9001", donatedAt: new Date() });
  const profile = await prisma.donorProfile.findUniqueOrThrow({ where: { userId: donor.id } });
  await prisma.donation.update({ where: { id: donation.donationId }, data: { donorProfileId: profile.id } });
  await completeProcessing({ organizationId: bbOrg.id, donationId: donation.donationId });
  const components = await createComponents({
    organizationId: bbOrg.id,
    donationId: donation.donationId,
    components: [
      { componentType: "RBC", externalComponentId: "UB-9001-RBC" },
      { componentType: "PLASMA", externalComponentId: "UB-9001-PLASMA" },
    ],
  });

  world = {
    bbOrgId: bbOrg.id,
    bbSourceSystem: "verify-blood-centre-ops",
    hospOrgId: hospOrg.id,
    hospSourceSystem: `hospital-${hospOrg.id.slice(0, 8)}`,
    donorUserId: donor.id,
    rbcId: components.componentIds[0]!,
    plasmaId: components.componentIds[1]!,
  };

  // Both components transferred to the hospital (VERIFIED, destination resolved).
  await transferComponent({
    organizationId: bbOrg.id,
    componentId: world.rbcId,
    destinationFacilityExternalCode: "VGH-MAIN",
  });
  await transferComponent({
    organizationId: bbOrg.id,
    componentId: world.plasmaId,
    destinationFacilityExternalCode: "VGH-MAIN",
  });
});

afterAll(async () => {
  const tables = [
    "auditLog",
    "notification",
    "notificationPreference",
    "outboxEmail",
    "disclosureDecision",
    "disclosureConsent",
    "recipientContext",
    "lifecycleEvent",
    "bloodComponent",
    "externalIdentifier",
    "donation",
    "donorProfile",
    "user",
    "facility",
    "organization",
  ] as const;
  if (prisma) {
    for (const table of tables) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any)[table].deleteMany({});
      } catch {
        // best-effort cleanup
      }
    }
    await prisma.$disconnect();
  }
  try {
    rmSync(DB_FILE, { force: true });
  } catch {
    // file may still be locked on Windows — best effort
  }
});

function hospitalCtx() {
  return {
    organizationId: world.hospOrgId,
    sourceSystem: world.hospSourceSystem,
    orgKind: "HOSPITAL",
  };
}

function bloodBankCtx() {
  return {
    organizationId: world.bbOrgId,
    sourceSystem: world.bbSourceSystem,
    orgKind: "BLOOD_BANK",
  };
}

describe("PI-6 verification gate on transfusion side effects", () => {
  it("PENDING transfusion: accepted, but NO decision, NO notification, skip audited", async () => {
    const result = await ingestEvent(
      {
        external_event_id: "pending-transfusion-1",
        component_identifier: world.rbcId,
        identifier_scheme: "INTERNAL_UUID",
        event_type: "COMPONENT_TRANSFUSED",
        occurred_at: new Date().toISOString(),
        verification_status: "PENDING",
        disclosure: {
          level: "BROAD_PURPOSE",
          category: "EMERGENCY_CARE",
          recipient_ref: "anon-ref-pending",
          patient_consent_verified: true,
        },
      },
      hospitalCtx()
    );

    expect(result.status).toBe("ACCEPTED");
    expect(result.disclosureGrantedLevel).toBeNull();
    expect(result.notificationCreated).toBe(false);

    const decision = await prisma.disclosureDecision.findFirst({
      where: { eventId: result.lifecycleEventId },
    });
    expect(decision).toBeNull();

    const consent = await prisma.disclosureConsent.findFirst({
      where: { recipientRef: "anon-ref-pending" },
    });
    expect(consent).toBeNull();

    const notification = await prisma.notification.findFirst({
      where: {
        userId: world.donorUserId,
        relatedComponentId: world.rbcId,
        typeKey: { in: ["notify.component.transfused", "notify.component.transfused.context"] },
      },
    });
    expect(notification).toBeNull();

    const skipAudit = await prisma.auditLog.findFirst({
      where: { action: "disclosure.skipped_unverified", resourceType: "LifecycleEvent", resourceId: result.lifecycleEventId },
    });
    expect(skipAudit).not.toBeNull();
  });

  it("VERIFIED transfusion of the same unit still decides + notifies", async () => {
    const result = await ingestEvent(
      {
        external_event_id: "verified-transfusion-1",
        component_identifier: world.plasmaId,
        identifier_scheme: "INTERNAL_UUID",
        event_type: "COMPONENT_TRANSFUSED",
        occurred_at: new Date().toISOString(),
        verification_status: "VERIFIED",
        disclosure: {
          level: "BROAD_PURPOSE",
          category: "EMERGENCY_CARE",
          recipient_ref: "anon-ref-verified",
          patient_consent_verified: true,
        },
      },
      hospitalCtx()
    );

    expect(result.status).toBe("ACCEPTED");
    expect(result.disclosureGrantedLevel).toBe("BROAD_PURPOSE");
    expect(result.notificationCreated).toBe(true);

    const decision = await prisma.disclosureDecision.findFirstOrThrow({
      where: { eventId: result.lifecycleEventId },
    });
    expect(decision.grantedLevel).toBe("BROAD_PURPOSE");
  });
});

describe("attribution: ingesting hospital verifies consent/context", () => {
  it("consent verifiedByOrgId + context facilityOrgId are the hospital, not the blood bank", async () => {
    const consent = await prisma.disclosureConsent.findFirstOrThrow({
      where: { recipientRef: "anon-ref-verified" },
    });
    expect(consent.verifiedByOrgId).toBe(world.hospOrgId);
    expect(consent.verifiedByOrgId).not.toBe(world.bbOrgId);

    const context = await prisma.recipientContext.findUniqueOrThrow({
      where: { recipientRef: "anon-ref-verified" },
    });
    expect(context.facilityOrgId).toBe(world.hospOrgId);

    const decision = await prisma.disclosureDecision.findFirstOrThrow({
      where: { eventId: context.eventId! },
    });
    const provenance = JSON.parse(decision.provenanceJson);
    expect(provenance.organizationId).toBe(world.hospOrgId);
  });
});

describe("corrections supersede originals everywhere donor-facing", () => {
  it("corrected transfusion leaves community stats; corrected transfer revokes authorization", async () => {
    const { getCommunityStats } = await import("@/lib/services/stats");
    const statsBefore = await getCommunityStats();

    // Correct the VERIFIED plasma transfusion under the SAME source system.
    // A correction needs no identifiers — it attaches to its corrected fact.
    const contextRow = await prisma.recipientContext.findUniqueOrThrow({
      where: { recipientRef: "anon-ref-verified" },
    });
    const verified = await prisma.lifecycleEvent.findUniqueOrThrow({
      where: { id: contextRow.eventId! },
      select: { sourceEventId: true },
    });
    const correction = await ingestEvent(
      {
        external_event_id: "correction-1",
        identifier_scheme: "INTERNAL_UUID",
        event_type: "EVENT_CORRECTION",
        correction_of_source_event_id: verified.sourceEventId,
        occurred_at: new Date().toISOString(),
        verification_status: "VERIFIED",
      },
      hospitalCtx()
    );
    expect(correction.status).toBe("ACCEPTED");

    const originalTransfusion = await prisma.lifecycleEvent.findUniqueOrThrow({
      where: { id: contextRow.eventId! },
    });
    expect(originalTransfusion.supersededByCorrection).toBe(true);

    const statsAfter = await getCommunityStats();
    expect(statsAfter.transfusionEvents).toBe(statsBefore.transfusionEvents - 1);

    // Correcting the PLASMA transfer must revoke the hospital's authorization.
    const plasmaTransfer = await prisma.lifecycleEvent.findFirstOrThrow({
      where: { componentId: world.plasmaId, eventType: "COMPONENT_TRANSFERRED" },
      select: { sourceEventId: true, sourceSystem: true },
    });
    expect(plasmaTransfer.sourceSystem).toBe(world.bbSourceSystem);
    const transferCorrection = await ingestEvent(
      {
        external_event_id: "correction-2",
        identifier_scheme: "FACILITY_BARCODE",
        event_type: "EVENT_CORRECTION",
        correction_of_source_event_id: plasmaTransfer.sourceEventId,
        occurred_at: new Date().toISOString(),
        verification_status: "VERIFIED",
      },
      bloodBankCtx() // same source system that produced the original transfer
    );
    expect(transferCorrection.status).toBe("ACCEPTED");

    await expect(
      receiveComponent({ organizationId: world.hospOrgId, componentId: world.plasmaId })
    ).rejects.toThrow(IngestAuthzError);
  });
});
