/**
 * Donation reminder sweep (through the real service): an opted-in donor whose
 * latest linked donation crosses the whole-blood interval gets exactly one
 * reminder — in-app + outbox email — with an append-only audit marker making
 * every re-run a no-op. Guard tests prove reminders never fire for opt-outs,
 * donors inside the window, or donors whose latest donation is still fresh.
 * Runs against a throwaway sqlite DB created before prisma is imported.
 */
process.env.DATABASE_URL = "file:./test-reminders.db";

import path from "node:path";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Db = typeof import("@/packages/database/client")["prisma"];
const DB_URL = "file:./test-reminders.db";
const DB_FILE = path.resolve(process.cwd(), "src/packages/database/test-reminders.db");

let prisma: Db;
let runDonationReminders: (typeof import("@/lib/services/donation-reminders"))["runDonationReminders"];

let orgId: string;

const DAY_MS = 86_400_000;
const now = new Date();

async function seedDonor(email: string, opts: { reminders: boolean; donatedAt: Date }) {
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", displayName: email, role: "DONOR" },
  });
  const profile = await prisma.donorProfile.create({
    data: { userId: user.id, bloodGroup: "O+" },
  });
  await prisma.notificationPreference.create({
    data: { userId: user.id, donationReminders: opts.reminders },
  });
  const donation = await prisma.donation.create({
    data: {
      donorProfileId: profile.id,
      organizationId: orgId,
      externalDonationId: `ext-${email}`,
      donatedAt: opts.donatedAt,
      linkStatus: "LINKED",
    },
  });
  return { userId: user.id, donationId: donation.id };
}

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/packages/database/client"));
  ({ runDonationReminders } = await import("@/lib/services/donation-reminders"));

  const org = await prisma.organization.create({
    data: { name: "Reminder Blood Centre", kind: "BLOOD_BANK", status: "ACTIVE" },
  });
  orgId = org.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(DB_FILE, { force: true });
});

describe("runDonationReminders", () => {
  it("reminds an opted-in eligible donor once, across channels, with an audit marker", async () => {
    const donor = await seedDonor("eligible@example.com", {
      reminders: true,
      donatedAt: new Date(now.getTime() - 95 * DAY_MS),
    });

    const first = await runDonationReminders(now);
    expect(first.sent).toBe(1);
    expect(first.checked).toBe(1);

    const notification = await prisma.notification.findFirst({
      where: { userId: donor.userId, typeKey: "notify.eligibility.reminder" },
    });
    expect(notification).not.toBeNull();
    expect(notification!.relatedDonationId).toBe(donor.donationId);
    // Reminder copy is donor-own data only: specific on every channel (no PI-11 lockdown),
    // so the stored body must be the reminder template, never the generic one.
    const body = JSON.parse(notification!.bodyParamsJson ?? "{}") as { key?: string };
    expect(body.key).toBe("notify.reminderBody");

    const email = await prisma.outboxEmail.findFirst({
      where: { toEmail: "eligible@example.com" },
    });
    expect(email).not.toBeNull();
    expect(email!.subject).not.toContain("generic");

    const marker = await prisma.auditLog.findFirst({
      where: { action: "notification.eligibility_reminder_sent", resourceType: "Donation", resourceId: donor.donationId },
    });
    expect(marker).not.toBeNull();

    // Re-run (the cron fires every 15 minutes): dedup makes it a no-op.
    const second = await runDonationReminders(now);
    expect(second.sent).toBe(0);
    expect(second.checked).toBe(1);
  });

  it("never reminds donors who did not opt in", async () => {
    await seedDonor("optout@example.com", {
      reminders: false,
      donatedAt: new Date(now.getTime() - 95 * DAY_MS),
    });
    const summary = await runDonationReminders(now);
    const email = await prisma.outboxEmail.findFirst({ where: { toEmail: "optout@example.com" } });
    expect(email).toBeNull();
    expect(summary.sent).toBeGreaterThanOrEqual(0);
  });

  it("skips donors inside the whole-blood window", async () => {
    await seedDonor("fresh@example.com", {
      reminders: true,
      donatedAt: new Date(now.getTime() - 10 * DAY_MS),
    });
    const summary = await runDonationReminders(now);
    const email = await prisma.outboxEmail.findFirst({ where: { toEmail: "fresh@example.com" } });
    expect(email).toBeNull();
    expect(summary.sent).toBe(0);
  });

  it("counts only the latest donation — an older eligible donation is superseded", async () => {
    const user = await prisma.user.create({
      data: { email: "superseded@example.com", passwordHash: "x", displayName: "s", role: "DONOR" },
    });
    const profile = await prisma.donorProfile.create({ data: { userId: user.id } });
    await prisma.notificationPreference.create({
      data: { userId: user.id, donationReminders: true },
    });
    await prisma.donation.create({
      data: {
        donorProfileId: profile.id,
        organizationId: orgId,
        externalDonationId: "ext-old",
        donatedAt: new Date(now.getTime() - 200 * DAY_MS),
        linkStatus: "LINKED",
      },
    });
    const recent = await prisma.donation.create({
      data: {
        donorProfileId: profile.id,
        organizationId: orgId,
        externalDonationId: "ext-new",
        donatedAt: new Date(now.getTime() - 30 * DAY_MS),
        linkStatus: "LINKED",
      },
    });

    const summary = await runDonationReminders(now);
    const email = await prisma.outboxEmail.findFirst({
      where: { toEmail: "superseded@example.com" },
    });
    expect(email).toBeNull();

    const marker = await prisma.auditLog.findFirst({
      where: { action: "notification.eligibility_reminder_sent", resourceId: recent.id },
    });
    expect(marker).toBeNull();
    expect(summary.sent).toBe(0);
  });
});
