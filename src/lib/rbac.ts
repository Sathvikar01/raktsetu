import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { prisma } from "@/packages/database/client";

export type Role = SessionUser["role"];

/** Deny-by-default permission matrix. Deterministic — no runtime surprises. */
const PERMISSIONS: Record<Role, Set<string>> = {
  DONOR: new Set([
    "donation:read:own", "impact:read:own", "notification:read:own",
    "notification:write:own", "consent:write:own", "profile:write:own",
  ]),
  ORG_STAFF: new Set([
    "donation:create", "component:create", "event:ingest:manual",
    "integration:read:own-org", "simulator:use",
  ]),
  ORG_ADMIN: new Set([
    "donation:create", "component:create", "event:ingest:manual",
    "integration:read:own-org", "integration:write:own-org",
    "simulator:use", "org:read", "audit:read:own-org",
  ]),
  PLATFORM_ADMIN: new Set([
    "org:list", "org:manage", "integration:manage:any", "audit:read:any",
    "user:manage", "stats:read",
  ]),
};

export function can(role: Role, permission: string): boolean {
  return PERMISSIONS[role]?.has(permission) ?? false;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) redirect("/forbidden");
  return user;
}

export function requirePermission(permission: string): (user: SessionUser) => Promise<SessionUser> {
  return async (user) => {
    if (!can(user.role, permission)) throw new ForbiddenError();
    return user;
  };
}

/** Org-scoped membership check for staff/admin actions. */
export async function requireOrgMember(
  orgId: string,
  roles: Array<"ORG_ADMIN" | "STAFF"> = ["ORG_ADMIN", "STAFF"]
): Promise<{ user: SessionUser; role: string }> {
  const user = await requireUser();
  if (user.role === "PLATFORM_ADMIN") return { user, role: "PLATFORM_ADMIN" };
  if (!["ORG_STAFF", "ORG_ADMIN"].includes(user.role)) throw new ForbiddenError();
  const m = await prisma.organizationUser.findUnique({
    where: { orgId_userId: { orgId, userId: user.id } },
  });
  if (!m || m.status !== "ACTIVE" || !roles.includes(m.role as "ORG_ADMIN" | "STAFF")) {
    throw new ForbiddenError();
  }
  return { user, role: m.role };
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}
