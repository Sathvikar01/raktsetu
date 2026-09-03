import "server-only";
import { prisma } from "@/packages/database/client";
import { recordAudit } from "@/lib/audit";
import { hashedLimitKey, rateLimitPersistent } from "@/lib/rate-limit";
import { phoneHashKey, normalizePhone } from "@/lib/phone";
import { haversineKm, approximateDistanceKm } from "@/packages/domain/geo";
import { ForbiddenError } from "@/lib/rbac";

/**
 * Blood donation camps. Verified organizations (ACTIVE org, org-admin or
 * platform-admin actor) register camps; platform admins verify them; the
 * public discovers APPROVED upcoming camps sorted by real distance when
 * coordinates are available. Registration is rate-limited and phone numbers
 * are stored only as keyed hashes.
 */

export const CAMP_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
] as const;
export type CampStatus = (typeof CAMP_STATUSES)[number];

export interface CreateCampInput {
  orgId: string;
  createdById: string;
  name: string;
  description?: string | null;
  venue: string;
  city: string;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  startsAt: Date;
  endsAt: Date;
}

export interface CampListItem {
  id: string;
  name: string;
  description: string | null;
  venue: string;
  city: string;
  state: string | null;
  orgName: string;
  startsAt: Date;
  endsAt: Date;
  approxDistanceKm: number | null;
  registrationCount: number;
}

const MAX_CAMP_SPAN_DAYS = 14;

export async function createCamp(input: CreateCampInput): Promise<{ campId: string }> {
  const org = await prisma.organization.findUnique({
    where: { id: input.orgId },
    select: { id: true, status: true, name: true },
  });
  if (!org || org.status !== "ACTIVE") throw new ForbiddenError();

  if (!input.name.trim() || !input.venue.trim() || !input.city.trim()) {
    throw new Error("camp name, venue and city are required");
  }
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new Error("camp end must be after start");
  }
  if (input.endsAt.getTime() - input.startsAt.getTime() > MAX_CAMP_SPAN_DAYS * 86_400_000) {
    throw new Error("camp span too long");
  }
  if (input.latitude !== null && input.longitude === null) throw new Error("coordinates incomplete");
  if (input.longitude !== null && input.latitude === null) throw new Error("coordinates incomplete");

  const camp = await prisma.camp.create({
    data: {
      orgId: input.orgId,
      name: input.name.trim().slice(0, 160),
      description: input.description?.trim().slice(0, 500) || null,
      venue: input.venue.trim().slice(0, 200),
      city: input.city.trim().slice(0, 80),
      state: input.state?.trim().slice(0, 80) || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdById: input.createdById,
      status: "PENDING_APPROVAL",
    },
  });
  await recordAudit({
    actorType: "USER",
    actorId: input.createdById,
    action: "camp.created",
    resourceType: "Camp",
    resourceId: camp.id,
    orgId: input.orgId,
    metadata: { name: input.name.slice(0, 80), startsAt: input.startsAt.toISOString() },
  });
  return { campId: camp.id };
}

export async function approveCamp(campId: string, adminId: string): Promise<void> {
  const camp = await prisma.camp.findUnique({ where: { id: campId }, select: { id: true, status: true } });
  if (!camp || camp.status !== "PENDING_APPROVAL") throw new Error("camp not pending approval");
  await prisma.camp.update({
    where: { id: campId },
    data: { status: "APPROVED", approvedById: adminId, approvedAt: new Date() },
  });
  await recordAudit({
    actorType: "USER",
    actorId: adminId,
    action: "camp.approved",
    resourceType: "Camp",
    resourceId: campId,
  });
}

export async function rejectCamp(campId: string, adminId: string, reason: string): Promise<void> {
  const clean = reason.trim().slice(0, 200);
  if (clean.length < 4) throw new Error("rejection reason required");
  const camp = await prisma.camp.findUnique({ where: { id: campId }, select: { id: true, status: true } });
  if (!camp || camp.status !== "PENDING_APPROVAL") throw new Error("camp not pending approval");
  await prisma.camp.update({
    where: { id: campId },
    data: { status: "REJECTED", rejectedReason: clean, approvedById: adminId, approvedAt: new Date() },
  });
  await recordAudit({
    actorType: "USER",
    actorId: adminId,
    action: "camp.rejected",
    resourceType: "Camp",
    resourceId: campId,
    metadata: { reason: clean },
  });
}

export async function cancelCamp(input: {
  campId: string;
  actorId: string;
  orgId?: string; // organizer scope; platform admins pass none
}): Promise<void> {
  const camp = await prisma.camp.findUnique({
    where: { id: input.campId },
    select: { id: true, orgId: true, status: true },
  });
  if (!camp) throw new Error("camp not found");
  if (input.orgId && camp.orgId !== input.orgId) throw new ForbiddenError();
  if (!["PENDING_APPROVAL", "APPROVED"].includes(camp.status)) throw new Error("camp not cancellable");
  await prisma.camp.update({ where: { id: camp.id }, data: { status: "CANCELLED" } });
  await recordAudit({
    actorType: "USER",
    actorId: input.actorId,
    action: "camp.cancelled",
    resourceType: "Camp",
    resourceId: camp.id,
    orgId: camp.orgId,
  });
}

export interface DiscoverCampsInput {
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number;
  city?: string | null;
}

/** Public discovery: APPROVED camps that haven't ended, closest-first when geo is given. */
export async function discoverUpcomingCamps(input: DiscoverCampsInput): Promise<CampListItem[]> {
  const now = new Date();
  const camps = await prisma.camp.findMany({
    where: {
      status: "APPROVED",
      endsAt: { gt: now },
      ...(input.city ? { city: { contains: input.city } } : {}),
    },
    orderBy: { startsAt: "asc" },
    take: 100,
    include: {
      org: { select: { name: true } },
      registrations: { select: { id: true } },
    },
  });

  const hasGeo =
    typeof input.latitude === "number" &&
    typeof input.longitude === "number" &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude);

  const items: CampListItem[] = camps.map((camp) => {
    let distance: number | null = null;
    if (hasGeo && camp.latitude !== null && camp.longitude !== null) {
      distance = haversineKm(
        { latitude: input.latitude!, longitude: input.longitude! },
        { latitude: camp.latitude, longitude: camp.longitude }
      );
    }
    return {
      id: camp.id,
      name: camp.name,
      description: camp.description,
      venue: camp.venue,
      city: camp.city,
      state: camp.state,
      orgName: camp.org.name,
      startsAt: camp.startsAt,
      endsAt: camp.endsAt,
      approxDistanceKm: distance === null ? null : approximateDistanceKm(distance),
      registrationCount: camp.registrations.length,
    };
  });

  if (hasGeo) {
    const radius = input.radiusKm ?? 100;
    const filtered = items.filter((c) => c.approxDistanceKm === null || c.approxDistanceKm <= radius);
    return filtered.sort(
      (a, b) => (a.approxDistanceKm ?? Number.MAX_SAFE_INTEGER) - (b.approxDistanceKm ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return items;
}

export async function registerForCamp(input: {
  campId: string;
  userId?: string | null;
  name: string;
  phone?: string | null;
  headcount: number;
  ip?: string | null;
}): Promise<{ ok: boolean; reason?: "CAMP_CLOSED" | "RATE_LIMITED" | "INVALID" }> {
  const camp = await prisma.camp.findUnique({
    where: { id: input.campId },
    select: { id: true, status: true, endsAt: true },
  });
  if (!camp || camp.status !== "APPROVED" || camp.endsAt <= new Date()) {
    return { ok: false, reason: "CAMP_CLOSED" };
  }
  const headcount = Math.floor(input.headcount);
  if (!input.name.trim() || headcount < 1 || headcount > 5) return { ok: false, reason: "INVALID" };
  if (input.phone && !normalizePhone(input.phone)) return { ok: false, reason: "INVALID" };

  const limiterKey = input.userId
    ? hashedLimitKey("camp:reg:user", input.userId)
    : hashedLimitKey("camp:reg:ip", input.ip ?? "anonymous");
  const limited = await rateLimitPersistent(limiterKey, 5, 24 * 60 * 60_000);
  if (!limited.ok) return { ok: false, reason: "RATE_LIMITED" };

  const phoneE164 = input.phone ? normalizePhone(input.phone) : null;
  const registrationData = {
    campId: input.campId,
    userId: input.userId ?? null,
    name: input.name.trim().slice(0, 80),
    contactPhoneHash: phoneE164 ? phoneHashKey(phoneE164) : null,
    headcount,
  };
  if (input.userId) {
    // Logged-in donors update their existing registration instead of stacking.
    const existing = await prisma.campRegistration.findUnique({
      where: { campId_userId: { campId: input.campId, userId: input.userId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.campRegistration.update({
        where: { id: existing.id },
        data: { name: registrationData.name, contactPhoneHash: registrationData.contactPhoneHash, headcount },
      });
    } else {
      await prisma.campRegistration.create({ data: registrationData });
    }
  } else {
    await prisma.campRegistration.create({ data: registrationData });
  }
  await recordAudit({
    actorType: input.userId ? "USER" : "SYSTEM",
    actorId: input.userId ?? null,
    action: "camp.registered",
    resourceType: "Camp",
    resourceId: input.campId,
    metadata: { headcount },
  });
  return { ok: true };
}

export async function listCampsForOrganizer(orgId: string) {
  return prisma.camp.findMany({
    where: { orgId },
    orderBy: { startsAt: "desc" },
    take: 50,
    include: { registrations: { select: { id: true } } },
  });
}

export async function listCampsForModeration() {
  return prisma.camp.findMany({
    where: { status: "PENDING_APPROVAL" },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: {
      org: { select: { name: true, regionLabel: true } },
      registrations: { select: { id: true } },
    },
  });
}

/** Auto-complete APPROVED camps whose end time has passed. */
export async function runCampSweep(now: Date = new Date()): Promise<{ completed: number }> {
  const result = await prisma.camp.updateMany({
    where: { status: "APPROVED", endsAt: { lt: now } },
    data: { status: "COMPLETED" },
  });
  return { completed: result.count };
}
