import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/crypto";
import { env } from "@/lib/env";
import { processOutbox } from "@/packages/notifications/outbox-worker";

/**
 * Cron entrypoint for the outbox email worker (Vercel Cron hits this path
 * with `Authorization: Bearer $CRON_SECRET`). Self-hosters can call it the
 * same way, or run `npm run outbox:process` directly.
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

  const summary = await processOutbox();
  return NextResponse.json({ ok: true, summary });
}
