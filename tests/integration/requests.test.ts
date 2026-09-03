/**
 * Blood request lifecycle (through the real services): hospital requests units
 * -> blood bank fulfills with matching AVAILABLE stock (COMPONENT_RESERVED via
 * the ingest pipeline) -> transfer completes the flow. Guard tests prove
 * wrong-group/expired/foreign units are rejected, never reserved.
 * Runs against a throwaway sqlite DB created before prisma is imported.
 */
process.env.DATABASE_URL = "file:./test-requests.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-requests.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-requests.db");

let prisma: Db;
let recordDonation: (typeof import("@/lib/services/bloodbank-ops"))["recordDonation"];
let completeProcessing: (typeof import("@/lib/services/bloodbank-ops"))["completeProcessing"];
let createComponents: (typeof import("@/lib/services/bloodbank-ops"))["createComponents"];
let transferComponent: (typeof import("@/lib/services/bloodbank-ops"))["transferComponent"];
let receiveComponent: (typeof import("@/lib/services/hospital-ops"))["receiveComponent"];
let createBloodRequest: (typeof import("@/lib/services/requests"))["createBloodRequest"];
let fulfillBloodRequest: (typeof import("@/lib/services/requests"))["fulfillBloodRequest"];
let declineBloodRequest: (typeof import("@/lib/services/requests"))["declineBloodRequest"];
let cancelBloodRequest: (typeof import("@/lib/services/requests"))["cancelBloodRequest"];
let OpsValidationError: (typeof import("@/lib/services/bloodbank-ops"))["OpsValidationError"];
let OpsNotFoundError: (typeof import("@/lib/services/bloodbank-ops"))["OpsNotFoundError"];

let bbOrgId: string;
let bbOrgName: string;
let bbOrgKind: string;
let hospOrgId: string;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  const bbOps = await import("@/lib/services/bloodbank-ops");
  ({ recordDonation, completeProcessing, createComponents, transferComponent } = bbOps);
  OpsValidationError = bbOps.OpsValidationError;
  OpsNotFoundError = bbOps.OpsNotFoundError;
  ({ receiveComponent } = await import("@/lib/services/hospital-ops"));
  const requestsMod = await import("@/lib/services/requests");
  ({
    createBloodRequest,
    fulfillBloodRequest,
    declineBloodRequest,
    cancelBloodRequest,
  } = requestsMod);

  const bb = await prisma.organization.create({
    data: {
      name: "Request Blood Centre",
      kind: "BLOOD_BANK",
      status: "ACTIVE",
      facilities: { create: { name: "Main Lab", code: "LAB-01", kind: "PROCESSING_LAB" } },
    },
  });
  bbOrgId = bb.id;
  bbOrgName = bb.name;
  bbOrgKind = bb.kind;
  const hosp = await prisma.organization.create({
    data: {
      name: "Request General Hospital",
      kind: "HOSPITAL",
      status: "ACTIVE",
      facilities: {
        create: { name: "Main Campus", code: "MAIN", externalCode: "RQH-MAIN", kind: "HOSPITAL" },
      },
    },
  });
  hospOrgId = hosp.id;
});

afterAll(async () => {
  const tables = [
    "auditLog", "notification", "notificationPreference", "outboxEmail",
    "requestFulfillment", "bloodRequest",
    "integrationEvent", "integrationCredential", "integration",
    "disclosureDecision", "disclosureConsent", "recipientContext",
    "lifecycleEvent", "bloodComponent", "externalIdentifier",
    "donation", "facility", "donorProfile", "consentRecord", "user", "organization",
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

async function makeAvailableUnit(
  externalDonationId: string,
  bloodGroup: string,
  componentType: string,
  externalComponentId: string
): Promise<string> {
  const { donationId } = await recordDonation({
    organizationId: bbOrgId,
    externalDonationId,
    bloodGroup,
    donatedAt: new Date(),
    facilityCode: "LAB-01",
  });
  await completeProcessing({ organizationId: bbOrgId, donationId });
  const { componentIds } = await createComponents({
    organizationId: bbOrgId,
    donationId,
    components: [{ componentType, externalComponentId }],
  });
  return componentIds[0]!;
}

describe("blood requests", () => {
  it("creates a request and notifies target-org staff", async () => {
    const { requestId } = await createBloodRequest({
      requestingOrgId: hospOrgId,
      targetOrgId: bbOrgId,
      componentType: "RBC",
      bloodGroup: "O+",
      unitsRequested: 2,
      urgency: "URGENT",
    });
    const request = await prisma.bloodRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("PENDING");
    expect(request.requestNumber).toBeTruthy();
  });

  it("rejects invalid requests: unknown group, bad units, non-blood-bank target", async () => {
    await expect(
      createBloodRequest({
        requestingOrgId: hospOrgId,
        targetOrgId: bbOrgId,
        componentType: "RBC",
        bloodGroup: "ZZ",
        unitsRequested: 1,
      })
    ).rejects.toThrow(OpsValidationError);
    await expect(
      createBloodRequest({
        requestingOrgId: hospOrgId,
        targetOrgId: bbOrgId,
        componentType: "RBC",
        bloodGroup: "O+",
        unitsRequested: 99,
      })
    ).rejects.toThrow(OpsValidationError);
    // A hospital cannot be the target of a request.
    await expect(
      createBloodRequest({
        requestingOrgId: bbOrgId,
        targetOrgId: hospOrgId,
        componentType: "RBC",
        bloodGroup: "O+",
        unitsRequested: 1,
      })
    ).rejects.toThrow(OpsNotFoundError);
  });

  it("fulfills with matching units via COMPONENT_RESERVED, flips state to RESERVED", async () => {
    const unitA = await makeAvailableUnit("REQ-1001", "O+", "RBC", "REQ-RBC-A");
    const unitB = await makeAvailableUnit("REQ-1002", "O+", "RBC", "REQ-RBC-B");
    const wrongGroup = await makeAvailableUnit("REQ-1003", "A-", "RBC", "REQ-RBC-W");

    const { requestId } = await createBloodRequest({
      requestingOrgId: hospOrgId,
      targetOrgId: bbOrgId,
      componentType: "RBC",
      bloodGroup: "O+",
      unitsRequested: 2,
    });

    const result = await fulfillBloodRequest(bbOrgId, requestId, [unitA, wrongGroup, unitB]);
    expect(result.reservedComponentIds.sort()).toEqual([unitA, unitB].sort());
    expect(result.skipped.map((s) => s.reason)).toContain("TYPE_GROUP_MISMATCH");
    expect(result.status).toBe("FULFILLED");

    for (const id of [unitA, unitB]) {
      const component = await prisma.bloodComponent.findUniqueOrThrow({ where: { id } });
      expect(component.currentDerivedState).toBe("RESERVED");
    }
    const events = await prisma.lifecycleEvent.findMany({
      where: { componentId: { in: [unitA, unitB] }, eventType: "COMPONENT_RESERVED" },
    });
    expect(events.length).toBe(2);
    const request = await prisma.bloodRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("FULFILLED");
  });

  it("refuses expired or already-reserved units, and enforces org authorization", async () => {
    const expired = await makeAvailableUnit("REQ-2001", "B+", "RBC", "REQ-RBC-E1");
    await prisma.bloodComponent.update({
      where: { id: expired },
      data: { expiresAt: new Date(Date.now() - 86_400_000) },
    });

    const { requestId } = await createBloodRequest({
      requestingOrgId: hospOrgId,
      targetOrgId: bbOrgId,
      componentType: "RBC",
      bloodGroup: "B+",
      unitsRequested: 1,
    });
    const result = await fulfillBloodRequest(bbOrgId, requestId, [expired]);
    expect(result.reservedComponentIds).toEqual([]);
    expect(result.skipped[0]?.reason).toBe("EXPIRED");

    // The hospital cannot fulfill its own request against the blood bank's stock.
    const unit = await makeAvailableUnit("REQ-2002", "B+", "RBC", "REQ-RBC-E2");
    await expect(fulfillBloodRequest(hospOrgId, requestId, [unit])).rejects.toThrow(OpsNotFoundError);
  });

  it("reserves then transfers a reserved unit; decline and cancel guard statuses", async () => {
    const unit = await makeAvailableUnit("REQ-3001", "AB+", "PLASMA", "REQ-PLS-1");
    const { requestId } = await createBloodRequest({
      requestingOrgId: hospOrgId,
      targetOrgId: bbOrgId,
      componentType: "PLASMA",
      bloodGroup: "AB+",
      unitsRequested: 1,
    });
    await fulfillBloodRequest(bbOrgId, requestId, [unit]);

    // Reserved unit flows on to the hospital through the standard transfer path.
    await transferComponent({
      organizationId: bbOrgId,
      componentId: unit,
      destinationFacilityExternalCode: "RQH-MAIN",
    });
    const transferred = await prisma.bloodComponent.findUniqueOrThrow({ where: { id: unit } });
    expect(transferred.currentDerivedState).toBe("TRANSFERRED");

    // Decline only works on PENDING requests.
    const { requestId: openId } = await createBloodRequest({
      requestingOrgId: hospOrgId,
      targetOrgId: bbOrgId,
      componentType: "RBC",
      bloodGroup: "O-",
      unitsRequested: 1,
    });
    await declineBloodRequest(bbOrgId, openId, "no O- stock this week");
    const declined = await prisma.bloodRequest.findUniqueOrThrow({ where: { id: openId } });
    expect(declined.status).toBe("DECLINED");
    await expect(declineBloodRequest(bbOrgId, openId, "again")).rejects.toThrow(OpsValidationError);

    const { requestId: cancelId } = await createBloodRequest({
      requestingOrgId: hospOrgId,
      targetOrgId: bbOrgId,
      componentType: "RBC",
      bloodGroup: "O-",
      unitsRequested: 1,
    });
    await cancelBloodRequest(hospOrgId, cancelId);
    const cancelled = await prisma.bloodRequest.findUniqueOrThrow({ where: { id: cancelId } });
    expect(cancelled.status).toBe("CANCELLED");
    // The blood bank cannot cancel someone else's request.
    await expect(cancelBloodRequest(bbOrgId, cancelId)).rejects.toThrow(OpsNotFoundError);
  });
});
