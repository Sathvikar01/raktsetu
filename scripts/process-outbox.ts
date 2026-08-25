/**
 * Standalone outbox drainer for self-hosted deployments.
 * Usage: npm run outbox:process  (or a system cron hitting this script)
 */
import "dotenv/config";

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
