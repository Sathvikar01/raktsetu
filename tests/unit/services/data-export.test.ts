/**
 * Donor data export against a throwaway sqlite DB (same bootstrap pattern as
 * auth-flow.test.ts). Verifies completeness of the export and the PI-1 hard
 * rule: no RecipientContext / recipientRef / ageBand / treatmentCategory data
 * ever appears in the exported structure.
 */
process.env.DATABASE_URL = "file:./test-export.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-export.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-export.db");

let prisma: Db;
let buildDonorDataExport: (typeof import("@/lib/services/data-export"))["buildDonorDataExport"];
let hashPassword: (typeof import("@/lib/auth/passwords"))["hashPassword"];

const STRONG = "correct horse battery 9";

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  const service = await import("@/lib/services/data-export");
  ({ buildDonorDataExport } = service);
  const passwords = await import("@/lib/auth/passwords");
  ({ hashPassword } = passwords);
});

afterAll(async () => {
  const tables = [
    "auditLog",
    "disclosureDecision",
    "recipientContext",
    "lifecycleEvent",
    "bloodComponent",
    "externalIdentifier",
    "donation",
    "notification",
    "notificationPreference",
    "consentRecord",
    "donorProfile",
    "user",
    "facility",
    "organization",
    "integrationCredential",
    "integration",
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

describe("buildDonorDataExport", () => {
  it("exports profile, donations, components, consents and prefs; excludes recipient context entirely", async () => {
    const passwordHash = hashPassword(STRONG);
    const user = await prisma.user.create({
      data: {
        email: "export-test@demo.local",
        passwordHash,
        displayName: "Export Tester",
        role: "DONOR",
        donorProfile: {
          create: { bloodGroup: "O+", birthYear: 1990 },
        },
        notificationPreference: { create: { email: true, descriptiveContent: false } },
      },
      include: { donorProfile: true },
    });
    await prisma.consentRecord.create({
      data: {
        subjectType: "DONOR_PLATFORM",
        subjectRef: user.id,
        purposeKey: "data.export",
        granted: true,
      },
    });

    const org = await prisma.organization.create({
      data: { name: "Export Test Blood Centre", kind: "BLOOD_BANK", status: "ACTIVE" },
    });
    const donation = await prisma.donation.create({
      data: {
        donorProfileId: user.donorProfile!.id,
        organizationId: org.id,
        externalDonationId: "EXT-1",
        din: "DIN-1",
        donatedAt: new Date("2026-01-15T10:00:00Z"),
        linkStatus: "LINKED",
        linkCode: "testlinkcode1",
      },
    });
    const component = await prisma.bloodComponent.create({
      data: {
        donationId: donation.id,
        componentType: "RBC",
        externalComponentId: "COMP-1",
        currentDerivedState: "TRANSFUSED",
      },
    });

    const recipientRef = "opaque-recipient-ref-1234";
    const event = await prisma.lifecycleEvent.create({
      data: {
        componentId: component.id,
        donationId: donation.id,
        organizationId: org.id,
        eventType: "COMPONENT_TRANSFUSED",
        occurredAt: new Date("2026-01-20T09:00:00Z"),
        sourceSystem: "export-test-lis",
        sourceEventId: "SE-1",
        verificationStatus: "VERIFIED",
      },
    });
    await prisma.recipientContext.create({
      data: {
        recipientRef,
        componentId: component.id,
        eventId: event.id,
        facilityOrgId: org.id,
        ageBand: "18-40",
        treatmentCategory: "EMERGENCY_CARE",
      },
    });
    await prisma.disclosureDecision.create({
      data: {
        eventId: event.id,
        requestedLevel: "BROAD_PURPOSE",
        grantedLevel: "BROAD_PURPOSE",
        messageKey: "notify.transfusedBroad",
        provenanceJson: JSON.stringify({ organizationName: org.name }),
      },
    });

    const exp = await buildDonorDataExport(user.id);

    expect(exp.profile).toMatchObject({ displayName: "Export Tester", bloodGroup: "O+" });
    expect(exp.donations).toHaveLength(1);
    expect(exp.donations[0].din).toBe("DIN-1");
    expect(exp.donations[0].components[0].componentType).toBe("RBC");
    expect(exp.consents.some((c) => c.purposeKey === "data.export")).toBe(true);
    expect(exp.notificationPreference).toMatchObject({ email: true });
    expect(exp.disclosureViews).toHaveLength(1);
    expect(exp.disclosureViews[0]).toMatchObject({
      grantedLevel: "BROAD_PURPOSE",
      organizationName: "Export Test Blood Centre",
      sourceSystem: "export-test-lis",
    });

    // PI-1: serialized export must never contain recipient context fields.
    const serialized = JSON.stringify(exp);
    expect(serialized).not.toContain(recipientRef);
    expect(serialized).not.toContain("ageBand");
    expect(serialized).not.toContain("treatmentCategory");
    expect(serialized).not.toContain("recipientRef");
    expect(serialized).not.toContain("RecipientContext");
  });

  it("returns empty sections for a user with no donor profile", async () => {
    const user = await prisma.user.create({
      data: {
        email: "export-empty@demo.local",
        passwordHash: hashPassword(STRONG),
        displayName: "No Profile",
        role: "DONOR",
      },
    });
    const exp = await buildDonorDataExport(user.id);
    expect(exp.profile).toBeNull();
    expect(exp.donations).toEqual([]);
    expect(exp.disclosureViews).toEqual([]);
  });
});
