import { prisma } from "@/packages/database/client";
import { env } from "@/lib/env";
import type { ComponentType } from "@/packages/schemas/events";

export interface CommunityStats {
  donationsTracked: number;
  componentsProcessed: number;
  transfusionEvents: number;
  bloodCentres: number;
  hospitals: number;
  byComponentType: Array<{ type: string; label: string; count: number }>;
  monthlyDonations: Array<{ month: string; count: number }>;
}

export const COMPONENT_LABELS: Record<string, string> = {
  RBC: "Red blood cells",
  PLASMA: "Plasma",
  PLATELET: "Platelets",
  WHOLE_BLOOD: "Whole blood",
  OTHER: "Other",
};

/** Minimum cohort before any aggregate may be published (privacy-invariants PI-12). */
export function meetsAggregateThreshold(count: number): boolean {
  return count >= env.PRIVACY_MIN_AGGREGATE || env.DEMO_MODE;
}

/**
 * Aggregate-only community statistics. No ids, no timestamps finer than day,
 * no regions below state tier. Demo mode lowers the threshold so the public
 * dashboard can render with synthetic data — real deployments keep it strict.
 */
export async function getCommunityStats(): Promise<CommunityStats> {
  const min = env.DEMO_MODE ? Math.min(env.PRIVACY_MIN_AGGREGATE, 3) : env.PRIVACY_MIN_AGGREGATE;

  // Public pages must render even before the database is provisioned or
  // reachable (first-run deployments, maintenance windows): degrade to zeroed
  // aggregates, which every consumer already renders as empty states.
  try {
    return await queryCommunityStats(min);
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      console.error("community stats unavailable:", err instanceof Error ? err.message : err);
      return emptyStats();
    }
    throw err;
  }
}

function emptyStats(): CommunityStats {
  return {
    donationsTracked: 0,
    componentsProcessed: 0,
    transfusionEvents: 0,
    bloodCentres: 0,
    hospitals: 0,
    byComponentType: [],
    monthlyDonations: [],
  };
}

async function queryCommunityStats(min: number): Promise<CommunityStats> {
  const [donations, components, transfusions, bbCount, hospCount, byType] = await Promise.all([
    prisma.donation.count(),
    prisma.bloodComponent.count(),
    prisma.lifecycleEvent.count({ where: { eventType: "COMPONENT_TRANSFUSED", verificationStatus: "VERIFIED", supersededByCorrection: false } }),
    prisma.organization.count({ where: { kind: { in: ["BLOOD_BANK", "BLOOD_BANK_AND_HOSPITAL"] }, status: "ACTIVE" } }),
    prisma.organization.count({ where: { kind: { in: ["HOSPITAL", "BLOOD_BANK_AND_HOSPITAL"] }, status: "ACTIVE" } }),
    prisma.bloodComponent.groupBy({ by: ["componentType"], _count: { _all: true } }),
  ]);

  const donationRows = await prisma.donation.findMany({
    select: { donatedAt: true },
    orderBy: { donatedAt: "asc" },
  });
  const months = new Map<string, number>();
  for (const d of donationRows) {
    const k = d.donatedAt.toISOString().slice(0, 7);
    months.set(k, (months.get(k) ?? 0) + 1);
  }

  return {
    donationsTracked: donations,
    componentsProcessed: components,
    transfusionEvents: transfusions,
    bloodCentres: bbCount,
    hospitals: hospCount,
    byComponentType: byType.map((r) => ({
      type: r.componentType,
      label: COMPONENT_LABELS[r.componentType as ComponentType] ?? r.componentType,
      count: r._count._all,
    })).filter((c) => meetsAggregateThreshold(c.count)),
    monthlyDonations: [...months.entries()]
      .map(([month, count]) => ({ month, count }))
      .filter((m) => m.count >= min),
  };
}
