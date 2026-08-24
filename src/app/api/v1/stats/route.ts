import "server-only";

import { NextResponse } from "next/server";
import { getCommunityStats } from "@/lib/services/stats";
import { apiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MIN = 60;
const RATE_WINDOW_MS = 60_000;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "anonymous";
}

export async function GET(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const rl = rateLimit(`stats:${ip}`, RATE_LIMIT_PER_MIN, RATE_WINDOW_MS);
  if (!rl.ok) {
    return apiError("RATE_LIMITED", "Too many requests. Retry later.", 429, {
      retry_after_sec: rl.retryAfterSec,
    });
  }

  const data = await getCommunityStats();

  return NextResponse.json(
    {
      ok: true,
      data,
      meta: {
        generatedAt: new Date().toISOString(),
        privacyNote: "Aggregate-only; cohorts below threshold suppressed (PI-12).",
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        "Content-Type": "application/json",
      },
    }
  );
}

export async function POST(): Promise<Response> {
  return NextResponse.json(
    { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } },
    { status: 405, headers: { Allow: "GET" } }
  );
}

export async function PUT(): Promise<Response> {
  return NextResponse.json(
    { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } },
    { status: 405, headers: { Allow: "GET" } }
  );
}

export async function PATCH(): Promise<Response> {
  return NextResponse.json(
    { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } },
    { status: 405, headers: { Allow: "GET" } }
  );
}

export async function DELETE(): Promise<Response> {
  return NextResponse.json(
    { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } },
    { status: 405, headers: { Allow: "GET" } }
  );
}
