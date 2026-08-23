import { getDictionary } from "@/i18n";
import type { SessionUser } from "@/lib/auth/session";
import { can, ForbiddenError, requireOrgMember } from "@/lib/rbac";
import { ProvisioningNotFoundError } from "@/lib/services/provisioning";
import { isNextRedirectError } from "@/app/staff/shared";

/**
 * Server-side helpers shared by admin portal server actions.
 * Not a "use server" module — never imported by client components at runtime.
 */

export function friendlyAdminError(err: unknown): string {
  const d = getDictionary();
  if (err instanceof ProvisioningNotFoundError) return d.admin.errNotFound;
  if (err instanceof ForbiddenError) return d.admin.errForbidden;
  console.error(
    JSON.stringify({ level: "error", msg: "admin_action_failed", detail: err instanceof Error ? err.message : String(err) })
  );
  return d.common.errorGeneric;
}

export function adminFailure(err: unknown): { ok: false; message: string } {
  return { ok: false, message: friendlyAdminError(err) };
}

/** Org gate for admin actions — ACTIVE membership or PLATFORM_ADMIN. */
export async function gateAdminMembership(orgId: string): Promise<boolean> {
  try {
    await requireOrgMember(orgId);
    return true;
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return false;
  }
}

/** integration:write:own-org for org admins, integration:manage:any for platform admins. */
export function canManageIntegrations(user: SessionUser): boolean {
  return can(user.role, "integration:write:own-org") || can(user.role, "integration:manage:any");
}

export function str(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}
