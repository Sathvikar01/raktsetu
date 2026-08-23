import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/rbac";

export type ApiErrorCode =
  | "BAD_REQUEST" | "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN"
  | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL";

export function apiOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function apiAccepted<T>(data: T) {
  return NextResponse.json({ ok: true, status: "accepted", data }, { status: 202 });
}

export function apiError(code: ApiErrorCode, message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: { code, message, ...extra } }, { status });
}

/** Uniform error envelope — never leaks internals or PHI to clients. */
export function handleApiError(err: unknown) {
  if (err instanceof ZodError) {
    return apiError("VALIDATION_ERROR", "Request payload failed schema validation.", 422, {
      issues: err.issues.map((i) => ({ path: i.path.join("."), code: i.code })),
    });
  }
  if (err instanceof ForbiddenError) {
    return apiError("FORBIDDEN", "Not authorized for this resource.", 403);
  }
  if (err instanceof NotFoundError) {
    // Deliberately generic — do not reveal existence of other tenants' objects.
    return apiError("NOT_FOUND", "Resource not found.", 404);
  }
  console.error(JSON.stringify({ level: "error", msg: "api_unhandled", name: (err as Error)?.name }));
  return apiError("INTERNAL", "Internal error.", 500);
}

export class NotFoundError extends Error {
  constructor() {
    super("NotFound");
    this.name = "NotFoundError";
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new SyntaxError("invalid json");
  }
}
