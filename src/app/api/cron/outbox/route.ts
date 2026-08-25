import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processOutbox } from "@/packages/notifications/outbox-worker";

/**
 * Cron entrypoint for the outbox email worker (Vercel Cron hits this path
 * with `Authorization: Bearer $CRON_SECRET`). Self-hosters can call it the
 * same way, or run `npm run outbox:process` directly.
 * Fails closed in production when CRON_SECRET is not configured.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (env.isProd) {
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: { code: "CRON_NOT_CONFIGURED" } },
        { status: 503 }
      );
    }
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
  }

  const summary = await processOutbox();
  return NextResponse.json({ ok: true, summary });
}
