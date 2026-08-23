/**
 * Idempotent ingestion (PI-7): the same (sourceSystem, sourceEventId) must be
 * a no-op — DUPLICATE result, exactly one LifecycleEvent row, no duplicate
 * donor notifications, no duplicate audit rows.
 * Runs against a throwaway sqlite DB created before prisma is imported.
 */
process.env.DATABASE_URL = "file:./test-idem.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type PrismaClient = (typeof import("@/packages/database/client"))["prisma"];
type IngestFn = (typeof import("@/lib/services/ingest"))["ingestEvent"];

const DB_URL = "file:./test-idem.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-idem.db");

let prisma: PrismaClient;
let ingestEvent: IngestFn;
let ctxIds: { organizationId: string; donorUserId: string };

async function seedMinimalJourney(): Promise<void> {
  const org = await prisma.organization.create({
    data: { name: "Idempotency Blood Centre", kind: "BLOOD_BANK", status: "ACTIVE" },
  });
  const user = await prisma.user.create({
    data: {
      email: "idem-donor@test.local",
      passwordHash: "not-a-real-hash",
      displayName: "Idem Donor",
      role: "DONOR",
    },
  });
  const profile = await prisma.donorProfile.create({ data: { userId: user.id } });
  const donation = await prisma.donation.create({
    data: {
      donorProfileId: profile.id,
      organizationId: org.id,
      externalDonationId: "IDEM-D1",
      donatedAt: new Date(),
      linkStatus: "LINKED",
    },
  });
  const component = await prisma.bloodComponent.create({
    data: { donationId: donation.id, componentType: "RBC", externalComponentId: "IDEM-C1" },
  });
  await prisma.externalIdentifier.createMany({
    data: [
      {
        entityType: "DONATION",
        entityId: donation.id,
        scheme: "FACILITY_BARCODE",
        value: "IDEM-D1",
        organizationId: org.id,
      },
      {
        entityType: "COMPONENT",
        entityId: component.id,
        scheme: "FACILITY_BARCODE",
        value: "IDEM-C1",
        organizationId: org.id,
      },
    ],
  });
  ctxIds = { organizationId: org.id, donorUserId: user.id };
}

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  ({ ingestEvent } = await import("@/lib/services/ingest"));
  await seedMinimalJourney();
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

describe("ingestEvent idempotency (PI-7)", () => {
  it("returns ACCEPTED then DUPLICATE for the same source event id", async () => {
    const event = {
      external_event_id: "idem-evt-0001",
      component_identifier: "IDEM-C1",
      identifier_scheme: "FACILITY_BARCODE" as const,
      event_type: "COMPONENT_CREATED" as const,
      occurred_at: new Date().toISOString(),
      verification_status: "VERIFIED" as const,
    };
    const ctx = {
      organizationId: ctxIds.organizationId,
      sourceSystem: "test-ops",
      orgKind: "BLOOD_BANK",
    };

    const first = await ingestEvent(event, ctx);
    expect(first.status).toBe("ACCEPTED");

    const second = await ingestEvent(event, ctx);
    expect(second.status).toBe("DUPLICATE");
    expect(second.duplicateOf).toBe(first.lifecycleEventId);
  });

  it("stores exactly one LifecycleEvent row", async () => {
    const count = await prisma.lifecycleEvent.count({
      where: { sourceSystem: "test-ops", sourceEventId: "idem-evt-0001" },
    });
    expect(count).toBe(1);
  });

  it("does not duplicate donor notifications or audit entries", async () => {
    const notifications = await prisma.notification.findMany({
      where: { userId: ctxIds.donorUserId, typeKey: "notify.component.prepared" },
    });
    expect(notifications).toHaveLength(1);

    const audits = await prisma.auditLog.count({ where: { action: "event.ingested" } });
    expect(audits).toBe(1);
  });

  it("a different source system may reuse the same external id (tenant-scoped)", async () => {
    const event = {
      external_event_id: "idem-evt-0001",
      component_identifier: "IDEM-C1",
      identifier_scheme: "FACILITY_BARCODE" as const,
      event_type: "COMPONENT_AVAILABLE" as const,
      occurred_at: new Date().toISOString(),
      verification_status: "VERIFIED" as const,
    };
    const otherCtx = {
      organizationId: ctxIds.organizationId,
      sourceSystem: "other-system",
      orgKind: "BLOOD_BANK",
    };
    const result = await ingestEvent(event, otherCtx);
    expect(result.status).toBe("ACCEPTED");
  });
});
