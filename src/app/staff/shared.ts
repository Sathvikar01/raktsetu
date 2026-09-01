import { getDictionary } from "@/i18n";
import type { SessionUser } from "@/lib/auth/session";
import { CsrfError } from "@/lib/auth/session";
import { ForbiddenError, requireOrgMember } from "@/lib/rbac";
import {
  OpsNotFoundError,
  OpsValidationError,
} from "@/lib/services/bloodbank-ops";
import { parseDateTimeLocal as parseDateTimeLocalStrict } from "@/lib/datetime";
import { HospitalOpsNotFoundError } from "@/lib/services/hospital-ops";
import {
  IngestAuthzError,
  UnresolvableIdentifierError,
} from "@/lib/services/ingest";

/**
 * Server-side helpers shared by staff portal server actions.
 * Not a "use server" module — never imported by client components at runtime.
 */

export function isNextRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    ((err as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

/** Map known domain errors to friendly, i18n-rendered messages. Unknown → generic. */
export function friendlyOpsError(err: unknown): string {
  const d = getDictionary();
  if (err instanceof CsrfError) return d.common.errorGeneric;
  if (err instanceof OpsValidationError) return d.staff.errValidation;
  if (err instanceof OpsNotFoundError || err instanceof HospitalOpsNotFoundError) {
    return d.staff.errNotFound;
  }
  if (err instanceof IngestAuthzError) return d.staff.errNotAuthorizedUnit;
  if (err instanceof UnresolvableIdentifierError) return d.staff.errUnresolvable;
  if (err instanceof ForbiddenError) return d.common.forbiddenTitle;
  console.error(
    JSON.stringify({ level: "error", msg: "staff_action_failed", detail: err instanceof Error ? err.message : String(err) })
  );
  return d.common.errorGeneric;
}

export function opsFailure(err: unknown): { ok: false; message: string } {
  return { ok: false, message: friendlyOpsError(err) };
}

/**
 * Org gate for server actions (defense in depth on top of page-level requireRole).
 * Returns null when the caller is not an ACTIVE member of the org — callers must
 * treat that as deny-by-default. PLATFORM_ADMIN passes by construction (rbac.ts).
 */
export async function gateOrgMembership(orgId: string): Promise<boolean> {
  try {
    await requireOrgMember(orgId);
    return true;
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return false;
  }
}

export function str(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export function optionalStr(formData: FormData, name: string): string | null {
  const v = str(formData, name);
  return v.length > 0 ? v : null;
}

/**
 * datetime-local inputs arrive as local wall-clock strings without timezone.
 * Invalid input is a caller bug or a tampered form — it must surface as an
 * OpsValidationError (friendly staff message), never silently become now().
 */
export function parseDateTimeLocal(value: string): Date {
  try {
    return parseDateTimeLocalStrict(value);
  } catch {
    throw new OpsValidationError();
  }
}

export function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}
