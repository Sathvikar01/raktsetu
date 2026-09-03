/**
 * Inventory read-model + auto-expiry sweep (through the real services):
 * recordDonation with a blood group -> createComponents stamps group + expiry
 * -> getInventorySnapshot reflects availability and expiry buckets ->
 * runExpirySweep expires an overdue AVAILABLE unit via the ingest pipeline.
 * Runs against a throwaway sqlite DB created before prisma is imported.
 */
process.env.DATABASE_URL = "file:./test-inventory.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-inventory.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-inventory.db");

let prisma: Db;
let recordDonation: (typeof import("@/lib/services/bloodbank-ops"))["recordDonation"];
let completeProcessing: (typeof import("@/lib/services/bloodbank-ops"))["completeProcessing"];
let createComponents: (typeof import("@/lib/services/bloodbank-ops"))["createComponents"];
let getInventorySnapshot: (typeof import("@/lib/services/inventory"))["getInventorySnapshot"];
let runExpirySweep: (typeof import("@/lib/services/inventory-sweep"))["runExpirySweep"];

let bbOrgId: string;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  const bbOps = await import("@/lib/services/bloodbank-ops");
  ({ recordDonation, completeProcessing, createComponents } = bbOps);
  ({ getInventorySnapshot } = await import("@/lib/services/inventory"));
  ({ runExpirySweep } = await import("@/lib/services/inventory-sweep"));

  const org = await prisma.organization.create({
    data: {
      name: "Inventory Blood Centre",
      kind: "BLOOD_BANK",
      status: "ACTIVE",
      facilities: { create: { name: "Main Lab", code: "LAB-01", kind: "PROCESSING_LAB" } },
    },
  });
  bbOrgId = org.id;
});

afterAll(async () => {
  const tables = [
    "auditLog", "notification", "notificationPreference", "outboxEmail",
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

async function makeUnit(
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

describe("inventory read model", () => {
  it("stamps blood group and shelf-life expiry on created components", async () => {
    const rbcId = await makeUnit("INV-1001", "O+", "RBC", "INV-RBC-1");
    const component = await prisma.bloodComponent.findUniqueOrThrow({
      where: { id: rbcId },
    });
    expect(component.bloodGroup).toBe("O+");
    expect(component.expiresAt).not.toBeNull();
    const days =
      (component.expiresAt!.getTime() - component.preparedAt!.getTime()) / 86_400_000;
    expect(days).toBe(42);
  });

  it("summarizes availability and expiry buckets, and filters rows", async () => {
    await makeUnit("INV-1002", "O-", "RBC", "INV-RBC-2");
    await makeUnit("INV-1003", "A+", "PLATELET", "INV-PLT-3");

    const snapshot = await getInventorySnapshot(bbOrgId);
    expect(snapshot.totalLive).toBeGreaterThanOrEqual(3);
    const oPlusRbc = snapshot.availability.find(
      (a) => a.componentType === "RBC" && a.bloodGroup === "O+"
    );
    expect(oPlusRbc?.count).toBe(1);

    const filtered = await getInventorySnapshot(bbOrgId, { bloodGroup: "O-" });
    expect(filtered.rows.length).toBe(1);
    expect(filtered.rows[0]!.externalComponentId).toBe("INV-RBC-2");
  });

  it("expires an overdue AVAILABLE unit through the sweep", async () => {
    const id = await makeUnit("INV-1004", "B+", "RBC", "INV-RBC-4");
    // Back-date the denormalized expiry: the unit is now overdue.
    await prisma.bloodComponent.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 86_400_000) },
    });

    const summary = await runExpirySweep();
    expect(summary.expiredCount).toBeGreaterThanOrEqual(1);

    const component = await prisma.bloodComponent.findUniqueOrThrow({ where: { id } });
    expect(component.currentDerivedState).toBe("EXPIRED");
    // Idempotent: a second sweep must not re-expire anything.
    const second = await runExpirySweep();
    expect(second.expiredCount).toBe(0);
  });
});
