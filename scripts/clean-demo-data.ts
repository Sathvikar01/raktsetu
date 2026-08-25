/**
 * Remove ALL demo journey data (donations, components, lifecycle events,
 * disclosures, notifications, emails) while KEEPING demo accounts,
 * organizations, facilities, memberships, integrations and preferences.
 *
 * DEMO_MODE-gated like the seed (use --force to bypass). Safe to re-run.
 * Usage: npm run db:clean
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
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
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
  const force = process.argv.includes("--force");
  if (process.env.DEMO_MODE !== "true" && !force) {
    console.error("Refusing to run without DEMO_MODE=true (or --force).");
    return 1;
  }

  const { prisma } = await import("../src/packages/database/client");

  // Clinical/journey data first (FK-safe order), then donor-facing artifacts.
  // KEPT: users, sessions, consents, prefs, orgs, facilities, memberships,
  // integrations + credentials, partner requests, rate-limit buckets, audit log.
  const tables = [
    "disclosureDecision",
    "recipientContext",
    "componentLineage",
    "lifecycleEvent",
    "bloodComponent",
    "externalIdentifier",
    "donation",
    "notification",
    "outboxEmail",
  ] as const;

  for (const table of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (prisma as any)[table].deleteMany({});
    console.log(`${table}: deleted ${result.count}`);
  }

  // Reset derived state caches that referenced removed components (none left),
  // then disconnect.
  await prisma.$disconnect();
  console.log("=== Demo journey data cleared (accounts kept) ===");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
