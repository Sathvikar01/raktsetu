/**
 * Outbox worker state transitions against a throwaway sqlite DB:
 * - QUEUED rows are sent via the configured sender and marked SENT
 * - stale QUEUED rows (older than max age) become FAILED without send attempts
 * - SENT/FAILED rows are never touched
 */
process.env.DATABASE_URL = "file:./test-outbox.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/packages/notifications/email-sender", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/packages/notifications/email-sender")>();
  const sent: string[] = [];
  return {
    ...original,
    __sentLog: sent,
    resolveEmailSender: () => ({
      provider: "test",
      send: async (email: { to: string }) => {
        if (email.to === "fail@demo.local") return { ok: false, error: "test_forced_failure" };
        sent.push(email.to);
        return { ok: true };
      },
    }),
  };
});

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-outbox.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-outbox.db");

let prisma: Db;
let processOutbox: (typeof import("@/packages/notifications/outbox-worker"))["processOutbox"];

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  ({ processOutbox } = await import("@/packages/notifications/outbox-worker"));
});

afterAll(async () => {
  const tables = ["auditLog", "outboxEmail"] as const;
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

async function seedEmail(toEmail: string, status = "QUEUED", createdAt = new Date()) {
  return prisma.outboxEmail.create({
    data: { toEmail, subject: "s", bodyText: "b", status, createdAt },
  });
}

describe("processOutbox", () => {
  it("sends queued mail and marks SENT; retries failures; expires stale rows; skips terminal rows", async () => {
    const freshOk = await seedEmail("ok1@demo.local");
    const freshFail = await seedEmail("fail@demo.local");
    const stale = await seedEmail("stale@demo.local", "QUEUED", new Date(Date.now() - 48 * 3600_000));
    const alreadySent = await seedEmail("done@demo.local", "SENT", new Date(Date.now() - 3600_000));

    const run1 = await processOutbox();
    expect(run1.processed).toBe(3);
    expect(run1.sent).toBe(1); // ok1
    expect(run1.failed).toBe(1); // fail stays QUEUED for retry
    expect(run1.skippedExpired).toBe(1);

    const mod = await import("@/packages/notifications/email-sender");
    expect((mod as unknown as { __sentLog: string[] }).__sentLog).toEqual(["ok1@demo.local"]);

    expect((await prisma.outboxEmail.findUnique({ where: { id: freshOk.id } }))?.status).toBe("SENT");
    expect(
      (await prisma.outboxEmail.findUnique({ where: { id: freshOk.id } }))?.sentAt
    ).not.toBeNull();
    // Failed send remains QUEUED (retry next run)
    expect((await prisma.outboxEmail.findUnique({ where: { id: freshFail.id } }))?.status).toBe(
      "QUEUED"
    );
    // Stale row expired without a send attempt
    expect((await prisma.outboxEmail.findUnique({ where: { id: stale.id } }))?.status).toBe("FAILED");
    // Terminal SENT row untouched
    expect((await prisma.outboxEmail.findUnique({ where: { id: alreadySent.id } }))?.status).toBe(
      "SENT"
    );

    void alreadySent;
  });

  it("returns a zeroed summary when the outbox is empty", async () => {
    await prisma.outboxEmail.deleteMany({});
    const summary = await processOutbox();
    expect(summary).toEqual({ processed: 0, sent: 0, failed: 0, skippedExpired: 0 });
  });
});
