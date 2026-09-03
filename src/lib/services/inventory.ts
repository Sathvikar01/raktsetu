import "server-only";
import { prisma } from "@/packages/database/client";

/**
 * Inventory read model for the blood-bank staff portal. Reads ONLY the
 * denormalized caches (currentDerivedState, bloodGroup, expiresAt,
 * locationFacilityId) — every one of them is recomputed from lifecycle events
 * by ingest. This module never writes.
 */

export const INVENTORY_PAGE_SIZE = 50;

export type ExpiryWindow = "expired" | "week" | "month" | "later";

export interface InventoryFilters {
  componentType?: string;
  bloodGroup?: string;
  state?: string;
  expiryWindow?: ExpiryWindow;
  query?: string; // external component/donation id free text
  page?: number;
}

export interface InventoryRow {
  id: string;
  externalComponentId: string | null;
  componentType: string;
  bloodGroup: string | null;
  state: string;
  preparedAt: Date | null;
  expiresAt: Date | null;
  locationFacilityId: string | null;
  donationExternalId: string;
}

export interface InventorySnapshot {
  /** Live units (AVAILABLE + RESERVED) by component type × blood group. */
  availability: Array<{ componentType: string; bloodGroup: string | null; count: number }>;
  expiryBuckets: { expired: number; week: number; month: number; later: number };
  totalLive: number;
  rows: InventoryRow[];
  page: number;
  pageSize: number;
  totalRows: number;
}

const DAY_MS = 86_400_000;

function expiryWindowFilter(win: ExpiryWindow, now: Date) {
  const week = now.getTime() + 7 * DAY_MS;
  const month = now.getTime() + 30 * DAY_MS;
  switch (win) {
    case "expired":
      return { expiresAt: { lt: now } };
    case "week":
      return { expiresAt: { gte: now, lt: new Date(week) } };
    case "month":
      return { expiresAt: { gte: new Date(week), lt: new Date(month) } };
    case "later":
      return { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date(month) } }] };
  }
}

export async function getInventorySnapshot(
  organizationId: string,
  filters: InventoryFilters = {}
): Promise<InventorySnapshot> {
  const now = new Date();
  const liveStates = ["AVAILABLE", "RESERVED"];

  const [availability, expired, week, month, later] = await Promise.all([
    prisma.bloodComponent.groupBy({
      by: ["componentType", "bloodGroup"],
      where: { donation: { organizationId }, currentDerivedState: { in: liveStates } },
      _count: { _all: true },
      orderBy: [{ componentType: "asc" }],
    }),
    prisma.bloodComponent.count({
      where: { donation: { organizationId }, currentDerivedState: { in: liveStates }, expiresAt: { lt: now } },
    }),
    prisma.bloodComponent.count({
      where: {
        donation: { organizationId },
        currentDerivedState: { in: liveStates },
        expiresAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY_MS) },
      },
    }),
    prisma.bloodComponent.count({
      where: {
        donation: { organizationId },
        currentDerivedState: { in: liveStates },
        expiresAt: { gte: new Date(now.getTime() + 7 * DAY_MS), lt: new Date(now.getTime() + 30 * DAY_MS) },
      },
    }),
    prisma.bloodComponent.count({
      where: {
        donation: { organizationId },
        currentDerivedState: { in: liveStates },
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date(now.getTime() + 30 * DAY_MS) } }],
      },
    }),
  ]);

  const where = {
    donation: { organizationId },
    ...(filters.componentType ? { componentType: filters.componentType } : {}),
    ...(filters.bloodGroup ? { bloodGroup: filters.bloodGroup } : {}),
    ...(filters.state ? { currentDerivedState: filters.state } : {}),
    ...(filters.expiryWindow ? expiryWindowFilter(filters.expiryWindow, now) : {}),
    ...(filters.query
      ? {
          OR: [
            { externalComponentId: { contains: filters.query } },
            { donation: { externalDonationId: { contains: filters.query } } },
          ],
        }
      : {}),
  };

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const [totalRows, components] = await Promise.all([
    prisma.bloodComponent.count({ where }),
    prisma.bloodComponent.findMany({
      where,
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
      take: INVENTORY_PAGE_SIZE,
      skip: (page - 1) * INVENTORY_PAGE_SIZE,
      select: {
        id: true,
        externalComponentId: true,
        componentType: true,
        bloodGroup: true,
        currentDerivedState: true,
        preparedAt: true,
        expiresAt: true,
        locationFacilityId: true,
        donation: { select: { externalDonationId: true } },
      },
    }),
  ]);

  return {
    availability: availability.map((a) => ({
      componentType: a.componentType,
      bloodGroup: a.bloodGroup,
      count: a._count._all,
    })),
    expiryBuckets: { expired, week, month, later },
    totalLive: expired + week + month + later,
    rows: components.map((c) => ({
      id: c.id,
      externalComponentId: c.externalComponentId,
      componentType: c.componentType,
      bloodGroup: c.bloodGroup,
      state: c.currentDerivedState,
      preparedAt: c.preparedAt,
      expiresAt: c.expiresAt,
      locationFacilityId: c.locationFacilityId,
      donationExternalId: c.donation.externalDonationId,
    })),
    page,
    pageSize: INVENTORY_PAGE_SIZE,
    totalRows,
  };
}

/**
 * Components currently available for a given type × group at one blood bank —
 * the picker behind request fulfillment. Unexpired AVAILABLE units only,
 * oldest-expiry first so staff naturally ship the shortest-dated stock.
 */
export async function listFulfillableComponents(
  organizationId: string,
  componentType: string,
  bloodGroup: string,
  take = 100
) {
  const now = new Date();
  return prisma.bloodComponent.findMany({
    where: {
      donation: { organizationId },
      componentType,
      bloodGroup,
      currentDerivedState: "AVAILABLE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ expiresAt: "asc" }],
    take,
    select: {
      id: true,
      externalComponentId: true,
      expiresAt: true,
      donation: { select: { externalDonationId: true } },
    },
  });
}
