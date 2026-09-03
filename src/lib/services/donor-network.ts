import "server-only";
import { prisma } from "@/packages/database/client";
import { recordAudit } from "@/lib/audit";
import { normalizePhone, phoneHashKey, encryptPhone, maskPhone, decryptPhone } from "@/lib/phone";
import { consumeVerificationToken } from "@/lib/services/otp";
import { donorCoords } from "@/lib/services/donor-search";
import { OpsValidationError } from "@/lib/services/bloodbank-ops";
import { BLOOD_GROUPS, type BloodGroup } from "@/packages/schemas/events";

/**
 * Donor-network profile service: onboarding and donor-side controls.
 *
 * Donor controls (spec): pause availability, set notification radius, update
 * location, withdraw from the network. Availability pausing is instant and
 * master — a paused donor is invisible to every matcher regardless of radius.
 * Phone numbers require a fresh OTP verification token on every change and
 * are stored encrypted + hashed, never rendered (maskPhone only).
 */

export const NOTIFY_RADIUS_KM_OPTIONS = [5, 10, 15, 25, 50, 100] as const;
const MAX_NOTIFY_RADIUS_KM = 100;

export interface DonorNetworkProfileView {
  profileId: string;
  bloodGroup: string | null;
  phoneMasked: string | null;
  phoneVerified: boolean;
  locationLabel: string | null;
  hasLocation: boolean;
  available: boolean;
  pausedAt: Date | null;
  notifyRadiusKm: number;
  lastDonationAt: Date | null;
  onboardedAt: Date | null;
}

export async function getDonorNetworkProfile(userId: string): Promise<DonorNetworkProfileView | null> {
  const profile = await prisma.donorProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      bloodGroup: true,
      phoneEncrypted: true,
      phoneVerifiedAt: true,
      locationLabel: true,
      latitude: true,
      longitude: true,
      available: true,
      pausedAt: true,
      notifyRadiusKm: true,
      lastDonationAt: true,
      onboardedAt: true,
    },
  });
  if (!profile) return null;
  return {
    profileId: profile.id,
    bloodGroup: profile.bloodGroup,
    phoneMasked: profile.phoneEncrypted ? maskPhone(decryptPhone(profile.phoneEncrypted) ?? "") : null,
    phoneVerified: profile.phoneVerifiedAt !== null,
    locationLabel: profile.locationLabel,
    hasLocation: profile.latitude !== null && profile.longitude !== null,
    available: profile.available,
    pausedAt: profile.pausedAt,
    notifyRadiusKm: profile.notifyRadiusKm,
    lastDonationAt: profile.lastDonationAt,
    onboardedAt: profile.onboardedAt,
  };
}

export interface UpdateDonorNetworkInput {
  userId: string;
  donorProfileId: string;
  bloodGroup?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string | null;
  available?: boolean;
  notifyRadiusKm?: number;
  lastDonationAt?: Date | null;
  /** Required whenever the phone number is new or changed. */
  phone?: string | null;
  phoneVerificationToken?: string | null;
}

export async function updateDonorNetworkProfile(input: UpdateDonorNetworkInput): Promise<void> {
  const existing = await prisma.donorProfile.findUnique({
    where: { id: input.donorProfileId },
    select: {
      id: true,
      userId: true,
      phoneHash: true,
      latitude: true,
      longitude: true,
    },
  });
  if (!existing || existing.userId !== input.userId) throw new OpsValidationError("profile not found");

  const data: Record<string, unknown> = {};

  if (input.bloodGroup !== undefined) {
    if (input.bloodGroup !== null && !BLOOD_GROUPS.includes(input.bloodGroup as BloodGroup)) {
      throw new OpsValidationError("unknown bloodGroup");
    }
    data["bloodGroup"] = input.bloodGroup;
  }

  if (input.latitude !== undefined && input.longitude !== undefined) {
    if (input.latitude === null || input.longitude === null) {
      data["latitude"] = null;
      data["longitude"] = null;
    } else {
      if (
        !Number.isFinite(input.latitude) ||
        !Number.isFinite(input.longitude) ||
        Math.abs(input.latitude) > 90 ||
        Math.abs(input.longitude) > 180
      ) {
        throw new OpsValidationError("invalid coordinates");
      }
      Object.assign(data, donorCoords(input.latitude, input.longitude));
    }
  }
  if (input.locationLabel !== undefined) {
    data["locationLabel"] = input.locationLabel?.trim().slice(0, 80) || null;
  }

  if (input.available !== undefined) {
    data["available"] = input.available;
    data["pausedAt"] = input.available ? null : new Date();
  }

  if (input.notifyRadiusKm !== undefined) {
    const radius = Math.floor(input.notifyRadiusKm);
    if (radius < 1 || radius > MAX_NOTIFY_RADIUS_KM) {
      throw new OpsValidationError("notification radius out of range");
    }
    data["notifyRadiusKm"] = radius;
  }

  if (input.lastDonationAt !== undefined) {
    data["lastDonationAt"] = input.lastDonationAt;
  }

  if (input.phone) {
    const e164 = normalizePhone(input.phone);
    if (!e164) throw new OpsValidationError("phone is not a valid mobile number");
    if (!input.phoneVerificationToken) throw new OpsValidationError("PHONE_NOT_VERIFIED");
    const consumed = await consumeVerificationToken({
      purpose: "DONOR_PHONE",
      phone: e164,
      token: input.phoneVerificationToken,
    });
    if (!consumed.ok) throw new OpsValidationError("PHONE_NOT_VERIFIED");
    data["phoneHash"] = phoneHashKey(e164);
    data["phoneEncrypted"] = encryptPhone(e164);
    data["phoneVerifiedAt"] = new Date();
    // Legacy plaintext column is never written for network phones.
  }

  if (Object.keys(data).length === 0) return;

  // Any profile change (re)marks onboarding complete — it is the same form.
  data["onboardedAt"] = new Date();
  await prisma.donorProfile.update({ where: { id: existing.id }, data });

  await recordAudit({
    actorType: "USER",
    actorId: input.userId,
    action: "donor_network.profile_updated",
    resourceType: "DonorProfile",
    resourceId: existing.id,
    metadata: {
      fields: Object.keys(data).join(","),
      phoneChanged: "phoneHash" in data,
    },
  });
}

/** Consent withdrawal for the donor network — full opt-out, instant. */
export async function withdrawFromDonorNetwork(userId: string, donorProfileId: string): Promise<void> {
  const profile = await prisma.donorProfile.findUnique({
    where: { id: donorProfileId },
    select: { id: true, userId: true },
  });
  if (!profile || profile.userId !== userId) throw new OpsValidationError("profile not found");
  await prisma.donorProfile.update({
    where: { id: profile.id },
    data: {
      available: false,
      pausedAt: new Date(),
      phoneHash: null,
      phoneEncrypted: null,
      phoneVerifiedAt: null,
      latitude: null,
      longitude: null,
      locationLabel: null,
      notifyRadiusKm: 15,
    },
  });
  await recordAudit({
    actorType: "USER",
    actorId: userId,
    action: "donor_network.withdrawn",
    resourceType: "DonorProfile",
    resourceId: profile.id,
    metadata: {},
  });
}
