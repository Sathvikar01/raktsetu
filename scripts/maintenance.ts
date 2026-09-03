/**
 * Standalone maintenance runner for self-hosted deployments: drains the
 * notification outbox and runs the inventory auto-expiry sweep.
 * Usage: npm run maintenance  (or a system cron hitting this script)
 * Mirrors GET /api/cron/outbox, which Vercel Cron calls instead.
 */
import Module from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// dotenv is not a direct dependency — load .env the same way seed.ts does.
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

// Same "server-only" bypass as scripts/seed.ts: the sweep service is written
// for the Next runtime; plain Node (tsx) needs the marker package neutralized.
type LoadFn = (this: unknown, request: string, parent: unknown, isMain: boolean) => unknown;
const moduleCtor = Module as unknown as { _load?: LoadFn };
if (typeof moduleCtor._load === "function" && !moduleCtor._load.name.startsWith("patched")) {
  const originalLoad = moduleCtor._load;
  moduleCtor._load = function patchedLoad(request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
}

async function main() {
  const { processOutbox } = await import("../src/packages/notifications/outbox-worker");
  const { runExpirySweep } = await import("../src/lib/services/inventory-sweep");
  const { runDonationReminders } = await import("../src/lib/services/donation-reminders");
  const { runEmergencySweep } = await import("../src/lib/services/emergency-requests");
  const { runCampSweep } = await import("../src/lib/services/camps");

  const outbox = await processOutbox();
  let sweep: Awaited<ReturnType<typeof runExpirySweep>> | null = null;
  let sweepError: string | null = null;
  try {
    sweep = await runExpirySweep();
  } catch (err) {
    sweepError = err instanceof Error ? err.message : "expiry sweep failed";
  }
  let reminders: Awaited<ReturnType<typeof runDonationReminders>> | null = null;
  let remindersError: string | null = null;
  try {
    reminders = await runDonationReminders();
  } catch (err) {
    remindersError = err instanceof Error ? err.message : "donation reminders failed";
  }
  let emergency: Awaited<ReturnType<typeof runEmergencySweep>> | null = null;
  let emergencyError: string | null = null;
  try {
    emergency = await runEmergencySweep();
  } catch (err) {
    emergencyError = err instanceof Error ? err.message : "emergency sweep failed";
  }
  let camps: Awaited<ReturnType<typeof runCampSweep>> | null = null;
  let campsError: string | null = null;
  try {
    camps = await runCampSweep();
  } catch (err) {
    campsError = err instanceof Error ? err.message : "camp sweep failed";
  }
  console.log(
    JSON.stringify({
      msg: "maintenance_run_complete",
      outbox, sweep, sweepError, reminders, remindersError, emergency, emergencyError, camps, campsError,
    })
  );
  process.exit(sweepError || remindersError || emergencyError || campsError ? 1 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", msg: "maintenance_run_failed", name: (err as Error)?.name }));
  process.exit(1);
});
