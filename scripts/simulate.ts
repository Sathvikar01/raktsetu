/**
 * RaktSetu demo journey simulator (Wave 2) — CLI wrapper around
 * simulateFullJourney() from src/lib/services/simulator.ts.
 *
 * DEMO_MODE-gated (same rule as scripts/seed.ts: refuse unless
 * process.env.DEMO_MODE === "true", or pass --force). Runs the full synthetic
 * donation journey — record -> processing/screening -> RBC/PLASMA/PLATELET ->
 * transfer to City General Hospital -> receive -> transfuse (BROAD_PURPOSE,
 * EMERGENCY_CARE) — entirely through the production ingest pipeline, then
 * prints a checklist: each step label, final component derived states, the
 * disclosure granted level and the donor's in-app notification count.
 *
 * Usage:
 *   npm run simulate [-- --donor-email=you@example.local]
 * Output is plain text so it can be pasted into docs/demo-flow.md.
 */
import Module from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (process.env.DEMO_MODE !== "true" && !argv.includes("--force")) {
    console.error(
      "[simulate] REFUSED: DEMO_MODE is not \"true\". This script creates synthetic demo data.\n" +
        "Set DEMO_MODE=true in .env or re-run with --force."
    );
    return 1;
  }

  const flag = argv.find((a) => a.startsWith("--donor-email"));
  const donorEmail =
    flag?.split("=")[1]?.trim() || "donor@demo.local";

  // Deferred imports so the server-only patch above applies first.
  const { prisma } = await import("@/packages/database/client");
  const { simulateFullJourney } = await import("@/lib/services/simulator");

  console.log("RaktSetu demo journey — ALL DATA IS SYNTHETIC (synthetic demo)");
  console.log(`Donor account: ${donorEmail}`);
  console.log("");

  const result = await simulateFullJourney({ donorEmail });

  console.log("Journey checklist:");
  result.steps.forEach((step, i) => {
    console.log(`  [${i + 1}/${result.steps.length}] ${step.key}: ${step.label}`);
  });
  console.log("");

  const components = await prisma.bloodComponent.findMany({
    where: { id: { in: Object.values(result.components) } },
    select: { componentType: true, currentDerivedState: true },
    orderBy: { componentType: "asc" },
  });
  console.log("Final component states (derived cache; events are truth):");
  for (const c of components) {
    console.log(`  ${c.componentType.padEnd(9)} -> ${c.currentDerivedState}`);
  }
  console.log("");

  const category = "EMERGENCY_CARE"; // fixed by the demo transfusion disclosure
  console.log(
    `Disclosure granted level: ${result.transfusionGrantedLevel ?? "NONE"} (${category})`
  );

  const user = await prisma.user.findUnique({
    where: { email: donorEmail.toLowerCase() },
    select: { id: true },
  });
  if (user) {
    const notificationCount = await prisma.notification.count({ where: { userId: user.id } });
    console.log(
      `In-app notifications for ${donorEmail}: ${notificationCount} ` +
        `(titles always generic — lock-screen safe)`
    );
  } else {
    console.log(
      `In-app notifications for ${donorEmail}: donor account not found ` +
        `(journey ran unlinked)`
    );
  }

  console.log("");
  console.log(`Donation link code (single-use, opaque): ${result.donation.linkCode}`);
  console.log("Done. Sign in as the donor above to see the timeline + verified impact.");

  await prisma.$disconnect();
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("[simulate] FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
