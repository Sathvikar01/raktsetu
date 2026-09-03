import "server-only";
import { prisma } from "@/packages/database/client";
import { boundingBox, haversineKm, quantizeCoordinate } from "@/packages/domain/geo";
import { eligibilityWindow } from "@/packages/domain/eligibility";
import type { BloodGroup } from "@/packages/schemas/events";

/**
 * Nearby-donor search for the emergency fallback stage.
 *
 * Privacy + safety filters are applied server-side, before any identity is
 * considered: phone-verified, ACTIVE account, explicitly available (not
 * paused), compatible blood group, within BOTH the request's current radius
 * AND the donor's own notification radius, and past the repeat-donation
 * interval (self-reported lastDonationAt; a linked donation supersedes it).
 * Coordinates are quantized (~1km) at write time, so distances are
 * approximate by construction.
 */

export interface NearbyDonorQuery {
  latitude: number;
  longitude: number;
  radiusKm: number;
  bloodGroups: BloodGroup[];
  componentType?: string;
  excludeProfileIds?: string[];
  limit?: number;
}

export interface NearbyDonor {
  profileId: string;
  userId: string;
  bloodGroup: BloodGroup;
  distanceKm: number;
  notifyRadiusKm: number;
}

export async function findNearbyCompatibleDonors(query: NearbyDonorQuery): Promise<NearbyDonor[]> {
  if (query.bloodGroups.length === 0 || query.radiusKm <= 0) return [];
  const box = boundingBox(
    { latitude: query.latitude, longitude: query.longitude },
    query.radiusKm
  );

  // DB-side prefilter: quantized bounding box + coarse attributes only.
  const candidates = await prisma.donorProfile.findMany({
    where: {
      available: true,
      phoneVerifiedAt: { not: null },
      latitude: { not: null, gte: box.minLat, lte: box.maxLat },
      longitude: { not: null, gte: box.minLng, lte: box.maxLng },
      bloodGroup: { in: query.bloodGroups },
      pausedAt: null,
      user: { status: "ACTIVE" },
      ...(query.excludeProfileIds?.length
        ? { id: { notIn: query.excludeProfileIds } }
        : {}),
    },
    select: {
      id: true,
      userId: true,
      bloodGroup: true,
      latitude: true,
      longitude: true,
      notifyRadiusKm: true,
      lastDonationAt: true,
      donations: { select: { donatedAt: true, linkStatus: true }, orderBy: { donatedAt: "desc" }, take: 1 },
    },
    take: 500, // bounding-box over-select; exact filtering happens below
  });

  const center = { latitude: query.latitude, longitude: query.longitude };
  const now = new Date();
  const out: NearbyDonor[] = [];
  for (const candidate of candidates) {
    if (candidate.latitude === null || candidate.longitude === null) continue;
    const distance = haversineKm(center, {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    });
    // A donor is never notified beyond their own consented radius, even for
    // an emergency — that control is theirs to widen, not the requester's.
    if (distance > query.radiusKm || distance > candidate.notifyRadiusKm) continue;
    // Repeat-donation interval: prefer the authoritative linked donation date,
    // fall back to the self-reported onboarding date.
    const lastDonation = candidate.donations[0]?.donatedAt ?? candidate.lastDonationAt;
    if (!eligibilityWindow(now, lastDonation ?? null).eligible) continue;
    out.push({
      profileId: candidate.id,
      userId: candidate.userId,
      bloodGroup: candidate.bloodGroup as BloodGroup,
      distanceKm: distance,
      notifyRadiusKm: candidate.notifyRadiusKm,
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return query.limit ? out.slice(0, query.limit) : out;
}

/** Quantized write helper — all donor coordinate writes go through this. */
export function donorCoords(latitude: number, longitude: number): { latitude: number; longitude: number } {
  return { latitude: quantizeCoordinate(latitude), longitude: quantizeCoordinate(longitude) };
}
