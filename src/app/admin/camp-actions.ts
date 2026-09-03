"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, ForbiddenError, requireRole } from "@/lib/rbac";
import { verifyCsrfToken } from "@/lib/auth/session";
import { gateAdminMembership } from "./shared";
import { createCamp, cancelCamp } from "@/lib/services/camps";
import { parseDateTimeLocal } from "@/lib/datetime";

/**
 * Org-admin camp actions (arg-style, CSRF-token verified). Camps are created
 * in PENDING_APPROVAL and only platform admins publish them.
 */

export interface CampFormResult {
  ok: boolean;
  messageKey?: string;
}

const CampSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  venue: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  latitude: z.coerce.number().min(-90).max(90).nullable(),
  longitude: z.coerce.number().min(-180).max(180).nullable(),
  startsAt: z.string().min(16),
  endsAt: z.string().min(16),
});

export async function createCampAction(
  csrfToken: string,
  organizationId: string,
  input: unknown
): Promise<CampFormResult> {
  const user = await requireRole("ORG_ADMIN", "PLATFORM_ADMIN");
  if (!(await verifyCsrfToken(csrfToken))) return { ok: false, messageKey: "admin.errForbidden" };
  if (!can(user.role, "camp:write:own-org") && user.role !== "PLATFORM_ADMIN") {
    return { ok: false, messageKey: "admin.errForbidden" };
  }
  if (!(await gateAdminMembership(organizationId))) return { ok: false, messageKey: "admin.errForbidden" };

  const parsed = CampSchema.safeParse(input);
  if (!parsed.success) return { ok: false, messageKey: "admin.errValidation" };
  if ((parsed.data.latitude === null) !== (parsed.data.longitude === null)) {
    return { ok: false, messageKey: "admin.errValidation" };
  }

  try {
    await createCamp({
      orgId: organizationId,
      createdById: user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      venue: parsed.data.venue,
      city: parsed.data.city,
      state: parsed.data.state || null,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      startsAt: parseDateTimeLocal(parsed.data.startsAt),
      endsAt: parseDateTimeLocal(parsed.data.endsAt),
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return { ok: false, messageKey: "admin.errValidation" };
  }
  revalidatePath("/admin");
  revalidatePath("/admin/platform");
  return { ok: true };
}

export async function cancelOrgCampAction(
  csrfToken: string,
  campId: string,
  organizationId: string
): Promise<CampFormResult> {
  const user = await requireRole("ORG_ADMIN", "PLATFORM_ADMIN");
  if (!(await verifyCsrfToken(csrfToken))) return { ok: false, messageKey: "admin.errForbidden" };
  if (!(await gateAdminMembership(organizationId))) return { ok: false, messageKey: "admin.errForbidden" };
  if (!z.string().uuid().safeParse(campId).success) return { ok: false, messageKey: "admin.errValidation" };
  try {
    await cancelCamp({ campId, actorId: user.id, orgId: organizationId });
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, messageKey: "admin.errForbidden" };
    return { ok: false, messageKey: "admin.errValidation" };
  }
  revalidatePath("/admin");
  return { ok: true };
}
