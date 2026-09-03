import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/crypto";
import { env } from "@/lib/env";
import { processOutbox } from "@/packages/notifications/outbox-worker";
import { runExpirySweep } from "@/lib/services/inventory-sweep";
import { runDonationReminders } from "@/lib/services/donation-reminders";

/**
 * Cron entrypoint for maintenance work (Vercel Cron hits this path with
 * `Authorization: Bearer $CRON_SECRET`): drains the outbox email worker and
 * runs the inventory auto-expiry sweep. Self-hosters can call it the same
 * way, or run `npm run outbox:process` / `npm run maintenance` directly.
 * Auth is enforced in EVERY environment whenever CRON_SECRET is configured;
 * in production a missing secret fails closed (503).
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (env.isProd) {
      return NextResponse.json(
        { ok: false, error: { code: "CRON_NOT_CONFIGURED" } },
        { status: 503 }
      );
    }
  } else if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const outbox = await processOutbox();
  // The sweep is best-effort: an ingest failure must not stop email delivery
  // reporting, but its error surfaces in the response for the cron log.
  let sweep: Awaited<ReturnType<typeof runExpirySweep>> | null = null;
  let sweepError: string | null = null;
  try {
    sweep = await runExpirySweep();
  } catch (err) {
    sweepError = err instanceof Error ? err.message : "expiry sweep failed";
  }
  // Reminders are best-effort like the sweep: an audit-keyed dedup marker
  // makes every run idempotent, so failures simply retry on the next tick.
  let reminders: Awaited<ReturnType<typeof runDonationReminders>> | null = null;
  let remindersError: string | null = null;
  try {
    reminders = await runDonationReminders();
  } catch (err) {
    remindersError = err instanceof Error ? err.message : "donation reminders failed";
  }
  return NextResponse.json({
    ok: !sweepError && !remindersError,
    summary: { outbox, sweep, sweepError, reminders, remindersError },
  });
}
