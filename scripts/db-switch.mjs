/**
 * Switch Prisma provider between postgresql and sqlite without hand-editing.
 * Usage: node scripts/db-switch.mjs [sqlite|postgres]
 * SQLite is a zero-dependency dev/test fallback; PostgreSQL is the primary target
 * (docker-compose). See docs/deployment.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "../src/packages/database/schema.prisma");
const target = process.argv[2] === "postgres" ? "postgresql" : process.argv[2] === "sqlite" ? "sqlite" : null;

if (!target) {
  console.error("Usage: node scripts/db-switch.mjs [sqlite|postgres]");
  process.exit(1);
}

let schema = readFileSync(schemaPath, "utf8");
const current = /provider\s*=\s*"(postgresql|sqlite)"/.exec(schema)?.[1];
if (current === target) {
  console.log(`provider already ${target}`);
} else {
  schema = schema.replace(/provider\s*=\s*"(postgresql|sqlite)"/, `provider = "${target}"`);
  writeFileSync(schemaPath, schema);
  console.log(`provider switched ${current} -> ${target}`);
}
