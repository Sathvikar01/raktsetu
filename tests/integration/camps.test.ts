/**
 * Camp lifecycle through the real services: verified-org registration ->
 * platform-admin verification -> public discovery (geo-sorted) -> donor
 * registration with rate limits. Runs against a throwaway sqlite DB.
 */
process.env.DATABASE_URL = "file:./test-camps.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-camps.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-camps.db");

let prisma: Db;
let createCamp: (typeof import("@/lib/services/camps"))["createCamp"];
let approveCamp: (typeof import("@/lib/services/camps"))["approveCamp"];
let rejectCamp: (typeof import("@/lib/services/camps"))["rejectCamp"];
let cancelCamp: (typeof import("@/lib/services/camps"))["cancelCamp"];
let discoverUpcomingCamps: (typeof import("@/lib/services/camps"))["discoverUpcomingCamps"];
let registerForCamp: (typeof import("@/lib/services/camps"))["registerForCamp"];
let runCampSweep: (typeof import("@/lib/services/camps"))["runCampSweep"];

let orgId: string;
let adminId: string;
let donorUserId: string;

const PUNE = { latitude: 18.5204, longitude: 73.8567 };

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  ({
    createCamp,
    approveCamp,
    rejectCamp,
    cancelCamp,
    discoverUpcomingCamps,
    registerForCamp,
    runCampSweep,
  } = await import("@/lib/services/camps"));

  const org = await prisma.organization.create({
    data: { name: "Camp Test Blood Centre", kind: "BLOOD_BANK", status: "ACTIVE" },
  });
  orgId = org.id;
  const admin = await prisma.user.create({
    data: {
      email: "camp-admin@camps.test",
      passwordHash: "x",
      displayName: "Camp Admin",
      role: "PLATFORM_ADMIN",
    },
  });
  adminId = admin.id;
  const donor = await prisma.user.create({
    data: {
      email: "camp-donor@camps.test",
      passwordHash: "x",
      displayName: "Camp Donor",
      role: "DONOR",
    },
  });
  donorUserId = donor.id;
});

afterAll(async () => {
  const tables = [
    "auditLog", "notification", "notificationPreference", "outboxEmail", "rateLimitBucket",
    "emergencyMatch", "emergencyRequestEvent", "emergencyRequest", "otpChallenge",
    "campRegistration", "camp",
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

function futureCamp(name: string, days: number) {
  return {
    name,
    venue: "Test Hall",
    city: "Pune",
    startsAt: new Date(Date.now() + days * 86_400_000),
    endsAt: new Date(Date.now() + days * 86_400_000 + 6 * 3_600_000),
  };
}

describe("camps", () => {
  it("creates a camp as PENDING_APPROVAL and hides it until approved", async () => {
    const { campId } = await createCamp({
      orgId,
      createdById: adminId,
      ...futureCamp("Central Drive", 5),
      latitude: PUNE.latitude,
      longitude: PUNE.longitude,
    });
    let camps = await discoverUpcomingCamps({ city: "Pune" });
    expect(camps.find((c) => c.name === "Central Drive")).toBeUndefined();

    await approveCamp(campId, adminId);
    camps = await discoverUpcomingCamps({});
    expect(camps.find((c) => c.name === "Central Drive")).toBeDefined();
  });

  it("rejects camps with a reason and keeps them invisible", async () => {
    const { campId } = await createCamp({
      orgId,
      createdById: adminId,
      ...futureCamp("Rejected Drive", 7),
    });
    await rejectCamp(campId, adminId, "venue not verified");
    const camps = await discoverUpcomingCamps({});
    expect(camps.find((c) => c.name === "Rejected Drive")).toBeUndefined();
    await expect(rejectCamp(campId, adminId, "again")).rejects.toThrow();
  });

  it("sorts discovery by distance when coordinates are given", async () => {
    await createCamp({
      orgId,
      createdById: adminId,
      name: "Far Camp",
      venue: "Far Hall",
      city: "Nashik",
      latitude: 19.9975, // ~165 km north of Pune
      longitude: 73.7898,
      startsAt: new Date(Date.now() + 4 * 86_400_000),
      endsAt: new Date(Date.now() + 4 * 86_400_000 + 6 * 3_600_000),
    });
    const { campId } = await createCamp({
      orgId,
      createdById: adminId,
      name: "Near Camp",
      venue: "Near Hall",
      city: "Pune",
      latitude: 18.529, // ~1 km from the search point
      longitude: 73.856,
      startsAt: new Date(Date.now() + 4 * 86_400_000),
      endsAt: new Date(Date.now() + 4 * 86_400_000 + 6 * 3_600_000),
    });
    await approveCamp(campId, adminId);

    const camps = await discoverUpcomingCamps({ latitude: PUNE.latitude, longitude: PUNE.longitude, radiusKm: 200 });
    const names = camps.map((c) => c.name).filter((n) => ["Near Camp", "Far Camp"].includes(n));
    expect(names[0]).toBe("Near Camp");
    const near = camps.find((c) => c.name === "Near Camp")!;
    expect(near.approxDistanceKm).toBeLessThanOrEqual(2);
  });

  it("registers donors once per account, updates headcount, and rate-limits abuse", async () => {
    await prisma.rateLimitBucket.deleteMany();
    const camps = await discoverUpcomingCamps({ city: "Pune" });
    const camp = camps.find((c) => c.name === "Central Drive")!;
    const first = await registerForCamp({
      campId: camp.id,
      userId: donorUserId,
      name: "Camp Donor",
      headcount: 1,
    });
    expect(first.ok).toBe(true);
    const second = await registerForCamp({
      campId: camp.id,
      userId: donorUserId,
      name: "Camp Donor",
      headcount: 3,
    });
    expect(second.ok).toBe(true);
    const rows = await prisma.campRegistration.findMany({ where: { campId: camp.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.headcount).toBe(3);

    // Anonymous burst: 5 registrations per day per IP are allowed, the 6th is not.
    for (let i = 0; i < 5; i += 1) {
      const result = await registerForCamp({
        campId: camp.id,
        name: `Visitor ${i}`,
        headcount: 1,
        ip: "203.0.113.9",
      });
      expect(result.ok).toBe(true);
    }
    const blocked = await registerForCamp({
      campId: camp.id,
      name: "Visitor Too Many",
      headcount: 1,
      ip: "203.0.113.9",
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("RATE_LIMITED");
  });

  it("cancels, auto-completes past camps, and guards organizer scope", async () => {
    const { campId } = await createCamp({
      orgId,
      createdById: adminId,
      ...futureCamp("Cancelled Drive", 2),
    });
    await approveCamp(campId, adminId);
    await cancelCamp({ campId, actorId: adminId, orgId });
    await expect(
      cancelCamp({ campId, actorId: adminId, orgId: "other-org" })
    ).rejects.toThrow();

    // Auto-completion sweep: an approved camp whose end passed becomes COMPLETED.
    const { campId: pastId } = await createCamp({
      orgId,
      createdById: adminId,
      name: "Past Camp",
      venue: "Old Hall",
      city: "Pune",
      startsAt: new Date(Date.now() - 4 * 86_400_000),
      endsAt: new Date(Date.now() - 3 * 86_400_000),
    });
    await approveCamp(pastId, adminId);
    const sweep = await runCampSweep();
    expect(sweep.completed).toBeGreaterThanOrEqual(1);
    const past = await prisma.camp.findUniqueOrThrow({ where: { id: pastId } });
    expect(past.status).toBe("COMPLETED");
  });
});
