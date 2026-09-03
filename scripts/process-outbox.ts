/**
 * Standalone outbox drainer for self-hosted deployments.
 * Usage: npm run outbox:process  (or a system cron hitting this script)
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Module from "node:module";

// dotenv is not a direct dependency — load .env the same way seed.ts does.
function loadDotEnv(): void {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n").map((l) => l.replace(/\r$/, ""))) {
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

// Same "server-only" bypass as scripts/seed.ts: the outbox worker is written
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
  const summary = await processOutbox();
  console.log(JSON.stringify({ msg: "outbox_run_complete", ...summary }));
  process.exit(0);
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", msg: "outbox_run_failed", name: (err as Error)?.name }));
  process.exit(1);
});
