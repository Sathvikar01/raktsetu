"use server";

import { headers } from "next/headers";
import { runDemoJourney, type DemoJourneyResult } from "@/lib/services/demo-journey";
import { clientIpFrom, hashedLimitKey, rateLimitPersistent } from "@/lib/rate-limit";

const MAX_DEMO_RUNS_PER_HOUR = 3;

/**
 * Anonymous demo generation is throttled per hashed IP: replaying the demo
 * mints synthetic rows, so without a per-IP cap one client could churn the
 * database endlessly. Demo rows are additionally excluded from public stats.
 */
export async function runDemoJourneyAction(): Promise<DemoJourneyResult> {
  const h = await headers();
  const ip = clientIpFrom(h) ?? "anonymous";
  const rl = await rateLimitPersistent(
    `demo-run:${hashedLimitKey("ip", ip)}`,
    MAX_DEMO_RUNS_PER_HOUR,
    60 * 60_000
  );
  if (!rl.ok) {
    return {
      ok: false,
      message: "RATE_LIMITED",
    };
  }
  return runDemoJourney();
}
