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

  // --- Summary table ------------------------------------------------------
  const counts = {
    organizations: await prisma.organization.count(),
    facilities: await prisma.facility.count(),
    users: await prisma.user.count(),
    integrations: await prisma.integration.count(),
  };

  console.log("");
  console.log("=== Demo seed summary (SYNTHETIC DATA — not real people or facilities) ===");
  const rows: Array<[string, string]> = [
    ["Organization", `${bloodBank.name} (BLOOD_BANK, ACTIVE)`],
    ["Organization", `${hospital.name} (HOSPITAL, ACTIVE)`],
    ["Facility", `Seva Blood Centre / Main Lab [SBC-LAB] PROCESSING_LAB`],
    ["Facility", `City General Hospital / Main Campus [MAIN -> CGH-MAIN] HOSPITAL`],
    ...users.map(
      (u): [string, string] => ["User", `${u.label} ${u.role} (password: ${DEMO_PASSWORD})`]
    ),
    ["Membership", `bb-staff@demo.local ORG_ADMIN @ Seva Blood Centre`],
    ["Membership", `hosp-staff@demo.local ORG_ADMIN @ City General Hospital`],
    ["DonorProfile", `donor@demo.local blood group O+ (default notification prefs)`],
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
      `${counts.users} users, ${counts.integrations} integrations`
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
