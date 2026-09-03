import { NextResponse } from "next/server";
import { clientIpFrom, hashedLimitKey, rateLimitPersistent } from "@/lib/rate-limit";
import { getPublicEmergencyStatus, advanceResolution } from "@/lib/services/emergency-requests";
import { prisma } from "@/packages/database/client";

/**
 * Public real-time status endpoint for an emergency request.
 *
 * Authorization: the request's unguessable publicToken (issued at creation,
 * shown only to the requester) — no login, but no enumeration either. The
 * GET is rate-limited per IP, and each poll opportunistically advances the
 * resolution pipeline for that request so a requester watching the page sees
 * stage progress in near-real-time even without cron.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;
  if (!token || token.length < 16 || token.length > 128) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const ip = clientIpFrom(request.headers);
  const limited = await rateLimitPersistent(
    // Keyed like all limiter keys; IP never persisted raw.
    hashedLimitKey("emergency:status", ip ?? "anonymous"),
    60,
    60_000
  );
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "RATE_LIMITED" } },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const status = await getPublicEmergencyStatus(token);
  if (!status) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // Lazy pipeline driver: advance this request when its dwell allows it.
  // Errors are swallowed — status readout must never fail because of the sweep.
  const row = await prisma.emergencyRequest.findUnique({
    where: { publicToken: token },
    select: { id: true, status: true },
  });
  if (row && ["PENDING", "SEARCHING_BANKS", "SEARCHING_DONORS"].includes(row.status)) {
    try {
      await advanceResolution(row.id);
    } catch {
      // best effort
    }
    const refreshed = await getPublicEmergencyStatus(token);
    return NextResponse.json({ ok: true, status: refreshed });
  }

  return NextResponse.json({ ok: true, status });
}
