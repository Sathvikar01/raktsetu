/**
 * RaktSetu demo seed (Wave 2).
 *
 * DEMO_MODE-gated, idempotent seed for a fully synthetic world:
 *   Org "Seva Blood Centre"   (BLOOD_BANK) + Facility SBC-LAB
 *   Org "City General Hospital" (HOSPITAL) + Facility MAIN / CGH-MAIN
 *   admin@demo.local          PLATFORM_ADMIN
 *   bb-staff@demo.local       ORG_STAFF + OrganizationUser(Seva Blood Centre, ORG_ADMIN)
 *   hosp-staff@demo.local     ORG_STAFF + OrganizationUser(City General Hospital, ORG_ADMIN)
 *   donor@demo.local          DONOR + DonorProfile(O+) + default NotificationPreference
 *   one Integration (+ credential) per demo org via createIntegrationWithCredential
 *
 * All data is SYNTHETIC and labelled as such. Refuses to run unless
 * process.env.DEMO_MODE === "true" (or --force). Safe to re-run: every entity
 * is upserted by its natural key; integration credentials are issued exactly
 * once per org (plaintext secret can only be shown at issue time).
 */
import Module from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Bootstrap: .env loading + "server-only" bypass for plain Node (tsx) runtime.
// tsx does not auto-load .env, and src/** services import "server-only", which
// throws outside a React Server Component bundle. The patch below makes the
// marker package resolve to an empty module when the seed runs under tsx —
// identical hashing/provisioning code paths are still used (no replication).
// ---------------------------------------------------------------------------

function loadDotEnv(): void {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    let value = m[2]!;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

type LoadFn = (this: unknown, request: string, parent: unknown, isMain: boolean) => unknown;
const moduleCtor = Module as unknown as { _load?: LoadFn };
if (typeof moduleCtor._load === "function" && !moduleCtor._load.name.startsWith("patched")) {
  const originalLoad = moduleCtor._load;
  moduleCtor._load = function patchedLoad(request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
}

interface SeedArgs {
  force: boolean;
}

function parseArgs(argv: string[]): SeedArgs {
  return { force: argv.includes("--force") };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (process.env.DEMO_MODE !== "true" && !args.force) {
    console.error(
      "[seed] REFUSED: DEMO_MODE is not \"true\". This script seeds synthetic demo data.\n" +
        "Set DEMO_MODE=true in .env or re-run with --force."
    );
    return 1;
  }

  // Imports deferred until after bootstrap so the server-only patch applies.
  const { prisma } = await import("@/packages/database/client");
  const { hashPassword } = await import("@/lib/auth/passwords");
  const { createIntegrationWithCredential } = await import("@/lib/services/provisioning");

  const DEMO_PASSWORD = "demo-pass-1234"; // letters + digits, >=10 chars — dev/demo only

  async function upsertOrganization(input: {
    name: string;
    kind: string;
    status: string;
  }): Promise<{ id: string; name: string }> {
    const existing = await prisma.organization.findFirst({
      where: { name: input.name, kind: input.kind },
      select: { id: true },
    });
    if (existing) {
      await prisma.organization.update({
        where: { id: existing.id },
        data: { status: input.status },
      });
      return { id: existing.id, name: input.name };
    }
    const created = await prisma.organization.create({
      data: { name: input.name, kind: input.kind, status: input.status },
      select: { id: true, name: true },
    });
    return created;
  }

  async function upsertFacility(input: {
    organizationId: string;
    name: string;
    code: string;
    externalCode?: string | null;
    kind: string;
  }): Promise<void> {
    await prisma.facility.upsert({
      where: {
        organizationId_code: { organizationId: input.organizationId, code: input.code },
      },
      update: { name: input.name, kind: input.kind, externalCode: input.externalCode ?? null },
      create: {
        organizationId: input.organizationId,
        name: input.name,
        code: input.code,
        externalCode: input.externalCode ?? null,
        kind: input.kind,
      },
    });
  }

  async function upsertUser(input: {
    email: string;
    displayName: string;
    role: string;
  }): Promise<{ id: string; email: string }> {
    const data = {
      passwordHash: hashPassword(DEMO_PASSWORD),
      displayName: input.displayName,
      role: input.role,
      status: "ACTIVE",
      // Demo accounts are pre-verified so staff sign-in works out of the box.
      emailVerifiedAt: new Date(),
    };
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: data,
      create: { email: input.email, ...data },
      select: { id: true, email: true },
    });
    return user;
  }

  interface UpsertedUser {
    id: string;
    email: string;
    label: string;
    role: string;
  }
  const users: UpsertedUser[] = [];

  console.log("[seed] Seeding synthetic demo world (DEMO_MODE)...");

  // --- Organizations & facilities -------------------------------------
  const bloodBank = await upsertOrganization({
    name: "Seva Blood Centre",
    kind: "BLOOD_BANK",
    status: "ACTIVE",
  });
  await upsertFacility({
    organizationId: bloodBank.id,
    name: "Main Lab",
    code: "SBC-LAB",
    externalCode: null,
    kind: "PROCESSING_LAB",
  });

  const hospital = await upsertOrganization({
    name: "City General Hospital",
    kind: "HOSPITAL",
    status: "ACTIVE",
  });
  await upsertFacility({
    organizationId: hospital.id,
    name: "Main Campus",
    code: "MAIN",
    externalCode: "CGH-MAIN",
    kind: "HOSPITAL",
  });

  // A second blood bank so emergency bank sweeps have multiple candidates.
  const eastBloodBank = await upsertOrganization({
    name: "Riverside Blood Bank",
    kind: "BLOOD_BANK",
    status: "ACTIVE",
  });
  await upsertFacility({
    organizationId: eastBloodBank.id,
    name: "Riverside Lab",
    code: "RSB-LAB",
    externalCode: null,
    kind: "PROCESSING_LAB",
  });

  // Public facility coordinates (~1km precision) power nearby search.
  const ORG_COORDS: Record<string, { latitude: number; longitude: number; regionLabel: string }> = {
    [bloodBank.id]: { latitude: 18.5204, longitude: 73.8567, regionLabel: "Central Pune" },
    [hospital.id]: { latitude: 18.5215, longitude: 73.8551, regionLabel: "Central Pune" },
    [eastBloodBank.id]: { latitude: 18.5503, longitude: 73.9402, regionLabel: "East Pune" },
  };
  for (const [orgId, coords] of Object.entries(ORG_COORDS)) {
    await prisma.organization.update({ where: { id: orgId }, data: coords });
  }

  // --- Users -----------------------------------------------------------
  const admin = await upsertUser({
    email: "admin@demo.local",
    displayName: "Demo Platform Admin",
    role: "PLATFORM_ADMIN",
  });
  users.push({ ...admin, label: "admin@demo.local", role: "PLATFORM_ADMIN" });

  const bbStaff = await upsertUser({
    email: "bb-staff@demo.local",
    displayName: "Demo Blood Bank Staff",
    role: "ORG_STAFF",
  });
  users.push({ ...bbStaff, label: "bb-staff@demo.local", role: "ORG_STAFF" });

  const hospStaff = await upsertUser({
    email: "hosp-staff@demo.local",
    displayName: "Demo Hospital Staff",
    role: "ORG_STAFF",
  });
  users.push({ ...hospStaff, label: "hosp-staff@demo.local", role: "ORG_STAFF" });

  const donor = await upsertUser({
    email: "donor@demo.local",
    displayName: "Demo Donor",
    role: "DONOR",
  });
  users.push({ ...donor, label: "donor@demo.local", role: "DONOR" });

  const donor2 = await upsertUser({
    email: "donor2@demo.local",
    displayName: "Asha Kulkarni",
    role: "DONOR",
  });
  users.push({ ...donor2, label: "donor2@demo.local", role: "DONOR" });

  const donor3 = await upsertUser({
    email: "donor3@demo.local",
    displayName: "Rohan Desai",
    role: "DONOR",
  });
  users.push({ ...donor3, label: "donor3@demo.local", role: "DONOR" });

  // --- Memberships -------------------------------------------------------
  await prisma.organizationUser.upsert({
    where: { orgId_userId: { orgId: bloodBank.id, userId: bbStaff.id } },
    update: { role: "ORG_ADMIN", status: "ACTIVE" },
    create: { orgId: bloodBank.id, userId: bbStaff.id, role: "ORG_ADMIN", status: "ACTIVE" },
  });
  await prisma.organizationUser.upsert({
    where: { orgId_userId: { orgId: hospital.id, userId: hospStaff.id } },
    update: { role: "ORG_ADMIN", status: "ACTIVE" },
    create: { orgId: hospital.id, userId: hospStaff.id, role: "ORG_ADMIN", status: "ACTIVE" },
  });

  // --- Donor profile + default notification preferences ------------------
  await prisma.donorProfile.upsert({
    where: { userId: donor.id },
    update: { bloodGroup: "O+" },
    create: { userId: donor.id, bloodGroup: "O+" },
  });
  await prisma.notificationPreference.upsert({
    where: { userId: donor.id },
    update: {},
    create: { userId: donor.id }, // platform defaults: inApp+email on, descriptive off
  });

  // --- Emergency donor network profiles ---------------------------------
  // Phones are stored through the same encrypt+hash path as production. One
  // donor is deliberately inside the repeat-donation deferral window so the
  // eligibility filter is exercised by the demo.
  const { phoneHashKey, encryptPhone } = await import("@/lib/phone");
  const networkDonors = [
    {
      userId: donor.id,
      bloodGroup: "O+",
      phone: "+919800000001",
      latitude: 18.5207,
      longitude: 73.8565,
      locationLabel: "Central Pune (demo)",
      notifyRadiusKm: 15,
      lastDonationAt: new Date(Date.now() - 130 * 86_400_000),
    },
    {
      userId: donor2.id,
      bloodGroup: "A+",
      phone: "+919800000002",
      latitude: 18.529,
      longitude: 73.856,
      locationLabel: "Deccan (demo)",
      notifyRadiusKm: 25,
      lastDonationAt: new Date(Date.now() - 200 * 86_400_000),
    },
    {
      userId: donor3.id,
      bloodGroup: "O-",
      phone: "+919800000003",
      latitude: 18.54,
      longitude: 73.89,
      locationLabel: "East Pune (demo)",
      notifyRadiusKm: 50,
      // Donated 30 days ago → deferred by the 90-day rule; excluded from matching.
      lastDonationAt: new Date(Date.now() - 30 * 86_400_000),
    },
  ];
  for (const nd of networkDonors) {
    const networkData = {
      bloodGroup: nd.bloodGroup,
      phoneHash: phoneHashKey(nd.phone),
      phoneEncrypted: encryptPhone(nd.phone),
      phoneVerifiedAt: new Date(),
      latitude: nd.latitude,
      longitude: nd.longitude,
      locationLabel: nd.locationLabel,
      available: true,
      notifyRadiusKm: nd.notifyRadiusKm,
      lastDonationAt: nd.lastDonationAt,
      onboardedAt: new Date(),
    };
    await prisma.donorProfile.upsert({
      where: { userId: nd.userId },
      update: networkData, // synthetic demo values — re-running the seed restores them
      create: { userId: nd.userId, ...networkData },
    });
    await prisma.notificationPreference.upsert({
      where: { userId: nd.userId },
      update: { sms: true },
      create: { userId: nd.userId, sms: true },
    });
  }

  // --- Demo camps (one approved + upcoming, one awaiting verification) ---
  await prisma.camp.upsert({
    where: { id: "seed-camp-1" },
    update: { status: "APPROVED" },
    create: {
      id: "seed-camp-1",
      orgId: bloodBank.id,
      name: "Weekend Donation Drive (demo)",
      description: "Synthetic demo camp at the blood centre — every Saturday.",
      venue: "Seva Blood Centre, Central Pune",
      city: "Pune",
      state: "Maharashtra",
      latitude: 18.5204,
      longitude: 73.8567,
      startsAt: new Date(Date.now() + 3 * 86_400_000),
      endsAt: new Date(Date.now() + 3 * 86_400_000 + 8 * 3_600_000),
      status: "APPROVED",
      createdById: bbStaff.id,
      approvedById: admin.id,
      approvedAt: new Date(),
    },
  });
  await prisma.camp.upsert({
    where: { id: "seed-camp-2" },
    update: {},
    create: {
      id: "seed-camp-2",
      orgId: eastBloodBank.id,
      name: "Corporate Campus Drive (demo)",
      description: "Awaiting platform-admin verification — invisible on /camps until approved.",
      venue: "Riverside Blood Bank",
      city: "Pune",
      state: "Maharashtra",
      latitude: 18.5503,
      longitude: 73.9402,
      startsAt: new Date(Date.now() + 10 * 86_400_000),
      endsAt: new Date(Date.now() + 10 * 86_400_000 + 6 * 3_600_000),
      status: "PENDING_APPROVAL",
      createdById: bbStaff.id,
    },
  });

  // --- TOTP secrets for privileged demo accounts --------------------------
  // REQUIRE_ADMIN_MFA defaults ON in production; provisioning real secrets
  // here keeps admin demo logins usable everywhere. Idempotent: an existing
  // secret is never rotated.
  const { generateTotpSecret } = await import("@/lib/auth/totp");
  const mfaRows: Array<{ email: string; userId: string }> = [
    { email: "admin@demo.local", userId: admin.id },
    { email: "bb-staff@demo.local", userId: bbStaff.id },
    { email: "hosp-staff@demo.local", userId: hospStaff.id },
  ];
  for (const row of mfaRows) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: row.userId },
      select: { mfaSecret: true },
    });
    if (!user.mfaSecret) {
      await prisma.user.update({
        where: { id: row.userId },
        data: { mfaSecret: generateTotpSecret(), mfaLastCounter: 0 },
      });
      console.log(`[seed] TOTP secret provisioned for ${row.email} (enroll at /mfa/enroll after sign-in).`);
    }
  }

  // --- Integrations (one per demo org, credential issued once) ------------
  interface IntegrationRow {
    orgName: string;
    created: boolean;
    keyId: string | null;
    secretOnce: string | null;
  }
  const integrations: IntegrationRow[] = [];

  async function ensureIntegration(
    orgId: string,
    orgName: string,
    adapterType: string
  ): Promise<void> {
    const existing = await prisma.integration.findFirst({
      where: { orgId },
      select: { id: true },
    });
    if (existing) {
      const credential = await prisma.integrationCredential.findFirst({
        where: { integrationId: existing.id, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { keyId: true },
      });
      integrations.push({ orgName, created: false, keyId: credential?.keyId ?? null, secretOnce: null });
      return;
    }
    const provisioned = await createIntegrationWithCredential(
      orgId,
      `${orgName} LIS`,
      adapterType,
      "Synthetic demo integration created by scripts/seed.ts"
    );
    integrations.push({
      orgName,
      created: true,
      keyId: provisioned.credential.keyId,
      secretOnce: provisioned.credential.secret,
    });
  }

  await ensureIntegration(bloodBank.id, bloodBank.name, "MOCK_BLOOD_BANK");
  await ensureIntegration(hospital.id, hospital.name, "MOCK_HOSPITAL");

  // --- Demo inventory (drives the real ops services, staggered expiry) ----
  // Deterministic external ids keep re-runs idempotent. expiresAt is then
  // staggered directly: it is a denormalized inventory fact, not an event.
  const { recordDonation, completeProcessing, createComponents } = await import(
    "@/lib/services/bloodbank-ops"
  );
  const DAY_MS = 86_400_000;
  const inventorySpec = [
    { externalDonationId: "seed-inv-1", bloodGroup: "O+", expiresInDays: 3, comps: [{ componentType: "RBC", externalComponentId: "seed-rbc-1" }] },
    { externalDonationId: "seed-inv-2", bloodGroup: "O-", expiresInDays: 12, comps: [{ componentType: "RBC", externalComponentId: "seed-rbc-2" }] },
    { externalDonationId: "seed-inv-3", bloodGroup: "A+", expiresInDays: 22, comps: [{ componentType: "RBC", externalComponentId: "seed-rbc-3" }, { componentType: "PLASMA", externalComponentId: "seed-plasma-3" }] },
    { externalDonationId: "seed-inv-4", bloodGroup: "B+", expiresInDays: 41, comps: [{ componentType: "RBC", externalComponentId: "seed-rbc-4" }] },
    { externalDonationId: "seed-inv-5", bloodGroup: "AB+", expiresInDays: 4, comps: [{ componentType: "PLATELET", externalComponentId: "seed-plt-5" }] },
    { externalDonationId: "seed-inv-6", bloodGroup: "O+", expiresInDays: 18, comps: [{ componentType: "RBC", externalComponentId: "seed-rbc-6" }] },
  ];
  let inventoryUnits = 0;
  for (const spec of inventorySpec) {
    const existing = await prisma.donation.findUnique({
      where: {
        organizationId_externalDonationId: {
          organizationId: bloodBank.id,
          externalDonationId: spec.externalDonationId,
        },
      },
      select: { id: true },
    });
    if (existing) continue;
    const { donationId } = await recordDonation(
      {
        organizationId: bloodBank.id,
        externalDonationId: spec.externalDonationId,
        bloodGroup: spec.bloodGroup,
        donatedAt: new Date(),
        facilityCode: "SBC-LAB",
      },
      { ingestedByUserId: null }
    );
    await completeProcessing({ organizationId: bloodBank.id, donationId });
    const { componentIds } = await createComponents(
      { organizationId: bloodBank.id, donationId, components: spec.comps },
      { ingestedByUserId: null }
    );
    for (const cid of componentIds) {
      await prisma.bloodComponent.update({
        where: { id: cid },
        data: { expiresAt: new Date(Date.now() + spec.expiresInDays * DAY_MS) },
      });
      inventoryUnits += 1;
    }
  }
  if (inventoryUnits > 0) {
    console.log(`[seed] demo inventory: ${inventoryUnits} live units at ${bloodBank.name}`);
  }

  // --- Summary table ------------------------------------------------------
  const counts = {
    organizations: await prisma.organization.count(),
    facilities: await prisma.facility.count(),
    users: await prisma.user.count(),
    integrations: await prisma.integration.count(),
    networkDonors: await prisma.donorProfile.count({ where: { phoneVerifiedAt: { not: null } } }),
    camps: await prisma.camp.count(),
  };

  console.log("");
  console.log("=== Demo seed summary (SYNTHETIC DATA — not real people or facilities) ===");
  const rows: Array<[string, string]> = [
    ["Organization", `${bloodBank.name} (BLOOD_BANK, ACTIVE, Central Pune)`],
    ["Organization", `${hospital.name} (HOSPITAL, ACTIVE, Central Pune)`],
    ["Organization", `${eastBloodBank.name} (BLOOD_BANK, ACTIVE, East Pune)`],
    ["Facility", `Seva Blood Centre / Main Lab [SBC-LAB] PROCESSING_LAB`],
    ["Facility", `City General Hospital / Main Campus [MAIN -> CGH-MAIN] HOSPITAL`],
    ...users.map(
      (u): [string, string] => ["User", `${u.label} ${u.role} (password: ${DEMO_PASSWORD})`]
    ),
    ["Membership", `bb-staff@demo.local ORG_ADMIN @ Seva Blood Centre`],
    ["Membership", `hosp-staff@demo.local ORG_ADMIN @ City General Hospital`],
    ["DonorProfile", `donor@demo.local O+ network donor (+91••••0001, Central Pune)`],
    ["DonorProfile", `donor2@demo.local A+ network donor (+91••••0002, Deccan)`],
    ["DonorProfile", `donor3@demo.local O- network donor (+91••••0003, deferred — donated 30d ago)`],
    ["Camp", `Weekend Donation Drive (APPROVED, visible on /camps)`],
    ["Camp", `Corporate Campus Drive (PENDING_APPROVAL, needs admin verification)`],
    ...integrations.map(
      (i): [string, string] => [
        i.created ? "Integration NEW" : "Integration",
        `${i.orgName} LIS keyId=${i.keyId ?? "-"}${
          i.secretOnce ? " secret printed above (shown ONCE)" : ""
        }`,
      ]
    ),
  ];
  const width = Math.max(...rows.map(([c]) => c.length));
  for (const [col, detail] of rows) {
    console.log(`  ${col.padEnd(width)} | ${detail}`);
  }
  for (const i of integrations) {
    if (i.created && i.secretOnce) {
      console.log("");
      console.log(`  WARNING (dev only): plaintext integration secret for "${i.orgName} LIS":`);
      console.log(`    keyId:   ${i.keyId}`);
      console.log(`    secret:  ${i.secretOnce}`);
      console.log("  Shown ONCE at issue time; never stored in the clear. Do NOT use in production.");
    }
  }
  console.log("");
  console.log(
    `  Totals in DB: ${counts.organizations} orgs, ${counts.facilities} facilities, ` +
      `${counts.users} users, ${counts.integrations} integrations, ` +
      `${counts.networkDonors} network donors, ${counts.camps} camps`
  );
  console.log("=== Seed complete ===");

  await prisma.$disconnect();
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("[seed] FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
