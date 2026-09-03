import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/crypto";
import { env } from "@/lib/env";
import { runEmergencySweep } from "@/lib/services/emergency-requests";
import { runCampSweep } from "@/lib/services/camps";

/**
 * Cron entrypoint for the emergency discovery network (same bearer-secret
 * contract as /api/cron/outbox): expires stale emergency requests, advances
 * active ones along the resolution pipeline (progressive radius expansion),
 * and auto-completes past camps. Self-hosters can also run
 * `npm run maintenance`.
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
  return NextResponse.json({
    ok: !emergencyError && !campsError,
    summary: { emergency, emergencyError, camps, campsError },
  });
}
