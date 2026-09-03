import "server-only";
import { prisma } from "@/packages/database/client";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { hashedLimitKey, rateLimitPersistent } from "@/lib/rate-limit";
import { OpsNotFoundError, OpsValidationError } from "@/lib/services/bloodbank-ops";
import { normalizePhone, phoneHashKey, encryptPhone, decryptPhone, maskPhone } from "@/lib/phone";
import { consumeVerificationToken } from "@/lib/services/otp";
import { findNearbyCompatibleDonors } from "@/lib/services/donor-search";
import { dispatchDonorNotification } from "@/packages/notifications/service";
import { sendSms } from "@/packages/notifications/sms-sender";
import { boundingBox, haversineKm, approximateDistanceKm } from "@/packages/domain/geo";
import { compatibleDonorGroupsForComponent } from "@/packages/domain/compatibility";
import { eligibilityWindow } from "@/packages/domain/eligibility";
import {
  type EmergencyStatus,
  type RequestUrgency,
  REQUEST_URGENCIES,
  isActiveEmergencyStatus,
  radiusLadderFor,
  dwellFor,
  expiryHoursFor,
  DONORS_PER_ROUND,
  MAX_DONOR_NOTIFICATIONS,
  MAX_BANKS_LISTED,
} from "@/packages/domain/emergency";
import { BLOOD_GROUPS, COMPONENT_TYPES, type BloodGroup, type ComponentType } from "@/packages/schemas/events";
import { toJson } from "@/lib/json";

/**
 * Public emergency blood discovery — the core resolution pipeline:
 *
 *   EMERGENCY REQUEST -> NEARBY BLOOD BANKS -> COMPATIBLE INVENTORY
 *     -> NEARBY VERIFIED DONORS -> EXPANDED RADIUS -> PARTNER/CAMP NETWORK
 *
 * Design invariants:
 *  - BLOOD-BANK-FIRST: bank inventory is swept (closest first, compatible
 *    groups included) before any donor is ever considered.
 *  - PROGRESSIVE RADIUS: donors are exposed rung-by-rung along the urgency's
 *    radius ladder, with a dwell window per rung — never a city-wide blast.
 *  - NO DEAD END: while active and unexpired, the sweep keeps escalating and
 *    the final escalation is recorded as PARTNER_NETWORK_ESCALATED.
 *  - PRIVACY-FIRST MATCHING: matching happens entirely server-side; donor
 *    identity/phone stay server-only until a donor accepts, and requester
 *    surfaces show blood group + approximate distance only.
 *
 * The pipeline is a resumable state machine: createEmergencyRequest() runs
 * the first steps synchronously, and every subsequent step is advanced by the
 * emergency sweep (cron) or by a status poll for the request — whichever
 * happens first. Every step is idempotent and audit-logged.
 */

const EMERGENCY_COMPONENT_TYPES = ["RBC", "WHOLE_BLOOD", "PLASMA", "PLATELET"] as const;

const REQUESTS_PER_PHONE_PER_DAY = 3;
const REQUESTS_PER_IP_PER_DAY = 10;

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateEmergencyRequestInput {
  componentType: string;
  bloodGroup: string;
  unitsRequested: number;
  urgency: string;
  hospitalName: string;
  city: string;
  latitude: number;
  longitude: number;
  contactName: string;
  contactPhone: string; // E.164 after normalization; verified via OTP token
  verificationToken: string;
  requesterUserId?: string | null;
  ip?: string | null;
}

export interface CreatedEmergencyRequest {
  requestId: string;
  requestNumber: string;
  publicToken: string;
  status: EmergencyStatus;
}

export async function createEmergencyRequest(
  input: CreateEmergencyRequestInput
): Promise<CreatedEmergencyRequest> {
  if (!BLOOD_GROUPS.includes(input.bloodGroup as BloodGroup)) {
    throw new OpsValidationError("unknown bloodGroup");
  }
  if (!EMERGENCY_COMPONENT_TYPES.includes(input.componentType as (typeof EMERGENCY_COMPONENT_TYPES)[number])) {
    throw new OpsValidationError("componentType not supported for emergency requests");
  }
  if (!REQUEST_URGENCIES.includes(input.urgency as RequestUrgency)) {
    throw new OpsValidationError("unknown urgency");
  }
  if (!Number.isInteger(input.unitsRequested) || input.unitsRequested < 1 || input.unitsRequested > 10) {
    throw new OpsValidationError("unitsRequested must be between 1 and 10");
  }
  if (!input.hospitalName.trim() || !input.city.trim() || !input.contactName.trim()) {
    throw new OpsValidationError("hospital, city and contact name are required");
  }
  const e164 = normalizePhone(input.contactPhone);
  if (!e164) throw new OpsValidationError("contact phone is not a valid mobile number");

  // OTP gate: the one-time verification token must be present and unused.
  const consumed = await consumeVerificationToken({
    purpose: "EMERGENCY_REQUEST",
    phone: e164,
    token: input.verificationToken,
  });
  if (!consumed.ok) {
    throw new OpsValidationError("PHONE_NOT_VERIFIED");
  }

  const pHash = phoneHashKey(e164);
  const perPhone = await rateLimitPersistent(
    hashedLimitKey("emergency:phone", pHash),
    REQUESTS_PER_PHONE_PER_DAY,
    24 * 60 * 60_000,
    { failClosed: true }
  );
  if (!perPhone.ok) throw new OpsValidationError("RATE_LIMITED");
  if (input.ip) {
    const perIp = await rateLimitPersistent(
      hashedLimitKey("emergency:ip", input.ip),
      REQUESTS_PER_IP_PER_DAY,
      24 * 60 * 60_000
    );
    if (!perIp.ok) throw new OpsValidationError("RATE_LIMITED");
  }

  // Duplicate / fake-request detection (defense before moderation):
  //  - an ACTIVE request from the same phone rejects outright;
  //  - rapid repeats or a same-hospital/same-group cluster get flagged for
  //    admin moderation instead of silently blocking legitimate relatives.
  const activeStates = ["PENDING", "SEARCHING_BANKS", "SEARCHING_DONORS", "DONOR_FOUND"];
  const [activeSamePhone, recentSamePhone, cluster] = await Promise.all([
    prisma.emergencyRequest.count({ where: { contactPhoneHash: pHash, status: { in: activeStates } } }),
    prisma.emergencyRequest.count({
      where: { contactPhoneHash: pHash, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
    }),
    prisma.emergencyRequest.count({
      where: {
        city: input.city.trim(),
        bloodGroup: input.bloodGroup,
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) },
        status: { in: activeStates },
        contactPhoneHash: { not: pHash },
      },
    }),
  ]);
  if (activeSamePhone > 0) throw new OpsValidationError("DUPLICATE_ACTIVE");

  let moderationStatus = "CLEAR";
  let flagReason: string | null = null;
  if (recentSamePhone >= 2) {
    moderationStatus = "FLAGGED";
    flagReason = "RAPID_REPEAT_REQUESTS";
  } else if (cluster > 0) {
    moderationStatus = "FLAGGED";
    flagReason = "POSSIBLE_DUPLICATE_LOCATION";
  }

  const now = new Date();
  const request = await prisma.emergencyRequest.create({
    data: {
      publicToken: randomToken(18),
      componentType: input.componentType,
      bloodGroup: input.bloodGroup,
      unitsRequested: input.unitsRequested,
      urgency: input.urgency,
      status: "PENDING",
      hospitalName: input.hospitalName.trim().slice(0, 160),
      city: input.city.trim().slice(0, 80),
      latitude: input.latitude,
      longitude: input.longitude,
      contactName: input.contactName.trim().slice(0, 80),
      contactPhoneHash: pHash,
      contactPhoneEncrypted: encryptPhone(e164),
      phoneVerifiedAt: now,
      requesterUserId: input.requesterUserId ?? null,
      moderationStatus,
      flagReason,
      expiresAt: new Date(now.getTime() + expiryHoursFor(input.urgency) * 3_600_000),
    },
  });

  await addEvent(request.id, "REQUEST_CREATED", {
    units: input.unitsRequested,
    urgency: input.urgency,
    flagged: moderationStatus === "FLAGGED",
  });
  await recordAudit({
    actorType: input.requesterUserId ? "USER" : "SYSTEM",
    actorId: input.requesterUserId ?? null,
    action: "emergency_request.created",
    resourceType: "EmergencyRequest",
    resourceId: request.id,
    metadata: {
      requestNumber: request.requestNumber,
      bloodGroup: input.bloodGroup,
      componentType: input.componentType,
      units: input.unitsRequested,
      urgency: input.urgency,
      moderationStatus,
    },
  });

  // First pipeline pass runs synchronously: the status page shows a real
  // stage immediately instead of waiting for the next sweep tick.
  await advanceResolution(request.id, now);

  const fresh = await prisma.emergencyRequest.findUniqueOrThrow({
    where: { id: request.id },
    select: { status: true, publicToken: true },
  });
  return {
    requestId: request.id,
    requestNumber: request.requestNumber,
    publicToken: fresh.publicToken,
    status: fresh.status as EmergencyStatus,
  };
}

// ---------------------------------------------------------------------------
// Resolution pipeline (resumable state machine)
// ---------------------------------------------------------------------------

async function addEvent(requestId: string, stage: string, detail?: Record<string, unknown>): Promise<void> {
  await prisma.emergencyRequestEvent.create({
    data: { requestId, stage, detailJson: toJson(detail ?? null) },
  });
}

async function transition(requestId: string, status: EmergencyStatus, stage: string): Promise<void> {
  await prisma.emergencyRequest.update({ where: { id: requestId }, data: { status } });
  await addEvent(requestId, stage);
}

interface BankSweepResult {
  totalUnits: number;
  banks: Array<{
    organizationId: string;
    name: string;
    areaLabel: string | null;
    distanceKm: number;
    unitsAvailable: number;
  }>;
}

/**
 * Blood-bank-first sweep: ACTIVE blood banks within `radiusKm`, compatible
 * groups only, AVAILABLE and unexpired components. Banks are recorded as
 * match rows (closest first) and the combined stock is reported upward.
 * `excludeOrgIds` lets callers sweep rung-by-rung without double counting.
 */
async function sweepBanks(
  request: {
    id: string;
    componentType: string;
    bloodGroup: string;
    latitude: number;
    longitude: number;
  },
  radiusKm: number,
  excludeOrgIds: string[] = []
): Promise<BankSweepResult> {
  const box = boundingBox({ latitude: request.latitude, longitude: request.longitude }, radiusKm);
  const banks = await prisma.organization.findMany({
    where: {
      status: "ACTIVE",
      kind: { in: ["BLOOD_BANK", "BLOOD_BANK_AND_HOSPITAL"] },
      latitude: { not: null, gte: box.minLat, lte: box.maxLat },
      longitude: { not: null, gte: box.minLng, lte: box.maxLng },
      ...(excludeOrgIds.length ? { id: { notIn: excludeOrgIds } } : {}),
    },
    select: { id: true, name: true, regionLabel: true, latitude: true, longitude: true },
    take: 200,
  });

  const compatibleGroups = compatibleDonorGroupsForComponent(
    request.bloodGroup as BloodGroup,
    request.componentType as ComponentType
  );
  const center = { latitude: request.latitude, longitude: request.longitude };
  const now = new Date();

  const nearby = banks
    .map((bank) => ({
      ...bank,
      distanceKm: haversineKm(center, { latitude: bank.latitude!, longitude: bank.longitude! }),
    }))
    .filter((b) => b.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const stock = nearby.length
    ? await prisma.bloodComponent.findMany({
        where: {
          donation: { organizationId: { in: nearby.map((b) => b.id) } },
          componentType: request.componentType,
          bloodGroup: { in: compatibleGroups },
          currentDerivedState: "AVAILABLE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { donation: { select: { organizationId: true } } },
      })
    : [];

  const unitsByOrg = new Map<string, number>();
  for (const unit of stock) {
    unitsByOrg.set(unit.donation.organizationId, (unitsByOrg.get(unit.donation.organizationId) ?? 0) + 1);
  }

  const withUnits = nearby
    .map((bank) => ({ ...bank, unitsAvailable: unitsByOrg.get(bank.id) ?? 0 }))
    .filter((b) => b.unitsAvailable > 0)
    .slice(0, MAX_BANKS_LISTED);

  for (const bank of withUnits) {
    await prisma.emergencyMatch.upsert({
      where: { requestId_organizationId: { requestId: request.id, organizationId: bank.id } },
      create: {
        requestId: request.id,
        kind: "BANK",
        organizationId: bank.id,
        bloodGroup: request.bloodGroup,
        unitsAvailable: bank.unitsAvailable,
        distanceKm: bank.distanceKm,
        radiusKm,
        status: "LISTED",
      },
      update: { unitsAvailable: bank.unitsAvailable, distanceKm: bank.distanceKm, radiusKm },
    });
  }

  return {
    totalUnits: withUnits.reduce((sum, b) => sum + b.unitsAvailable, 0),
    banks: withUnits.map((b) => ({
      organizationId: b.id,
      name: b.name,
      areaLabel: b.regionLabel,
      distanceKm: b.distanceKm,
      unitsAvailable: b.unitsAvailable,
    })),
  };
}

async function expandRadius(requestId: string, urgency: string, currentRound: number): Promise<number> {
  const ladder = radiusLadderFor(urgency);
  const nextRound = Math.min(currentRound + 1, ladder.length - 1);
  const nextRadius = ladder[nextRound];
  await prisma.emergencyRequest.update({
    where: { id: requestId },
    data: { radiusRound: nextRound, radiusKm: nextRadius },
  });
  if (nextRound !== currentRound) {
    await addEvent(requestId, "RADIUS_EXPANDED", { radiusKm: nextRadius });
  }
  return nextRound;
}

/**
 * Donor fallback for the current rung. Privacy-first: matches are created and
 * donors notified server-side; only coarse fields ever leave the service.
 */
async function sweepDonors(request: {
  id: string;
  urgency: string;
  componentType: string;
  bloodGroup: string;
  latitude: number;
  longitude: number;
  radiusRound: number;
}): Promise<number> {
  const ladder = radiusLadderFor(request.urgency);
  const radiusKm = ladder[request.radiusRound];

  const existing = await prisma.emergencyMatch.findMany({
    where: { requestId: request.id, kind: "DONOR" },
    select: { donorProfileId: true, status: true },
  });
  const notifiedSoFar = existing.length;
  if (notifiedSoFar >= MAX_DONOR_NOTIFICATIONS) return 0;

  const compatibleGroups = compatibleDonorGroupsForComponent(
    request.bloodGroup as BloodGroup,
    request.componentType as ComponentType
  );
  const donors = await findNearbyCompatibleDonors({
    latitude: request.latitude,
    longitude: request.longitude,
    radiusKm,
    bloodGroups: compatibleGroups,
    excludeProfileIds: existing.map((m) => m.donorProfileId).filter((x): x is string => x !== null),
    limit: Math.min(DONORS_PER_ROUND, MAX_DONOR_NOTIFICATIONS - notifiedSoFar),
  });
  if (donors.length === 0) return 0;

  for (const donor of donors) {
    const match = await prisma.emergencyMatch.create({
      data: {
        requestId: request.id,
        kind: "DONOR",
        donorProfileId: donor.profileId,
        bloodGroup: donor.bloodGroup,
        distanceKm: donor.distanceKm,
        radiusKm,
        status: "NOTIFIED",
        notifiedAt: new Date(),
      },
    });
    await alertMatchedDonor(match.id, donor.userId, request.id);
  }
  await addEvent(request.id, "DONORS_NOTIFIED", { count: donors.length, radiusKm });
  return donors.length;
}

/** In-app + email + (adapter-permitted) SMS/WhatsApp alert. Generic copy only. */
async function alertMatchedDonor(matchId: string, donorUserId: string, requestId: string): Promise<void> {
  await dispatchDonorNotification({
    userId: donorUserId,
    typeKey: "notify.emergency.match",
    genericTitle: true, // lock-screen safety: never leak emergency context out-of-band
    titleKey: "notify.emergency.matchTitle",
    bodyKey: "notify.emergency.matchBody",
    relatedComponentId: matchId,
  });

  const pref = await prisma.notificationPreference.findUnique({ where: { userId: donorUserId } });
  const wantsDirectChannel = pref?.sms || pref?.whatsapp;
  if (wantsDirectChannel) {
    const profile = await prisma.donorProfile.findUnique({
      where: { userId: donorUserId },
      select: { phoneEncrypted: true, phoneVerifiedAt: true, preferredLocale: true },
    });
    if (profile?.phoneEncrypted && profile.phoneVerifiedAt) {
      const e164 = decryptPhone(profile.phoneEncrypted);
      if (e164) {
        // Out-of-band text stays generic — a prompt to open the app, never
        // hospital/blood-group details.
        await sendSms(e164, "RaktSetu: a nearby blood request may need your help. Open RaktSetu to respond.");
      }
    }
  }

  await recordAudit({
    actorType: "SYSTEM",
    action: "emergency_match.notified",
    resourceType: "EmergencyMatch",
    resourceId: matchId,
    metadata: { requestId },
  });
}

/**
 * Advance the request one state-machine step. Returns the (possibly
 * unchanged) status. Idempotent and safe to call concurrently — every branch
 * re-reads the request before acting, and terminal states exit immediately.
 */
export async function advanceResolution(
  requestId: string,
  now: Date = new Date()
): Promise<EmergencyStatus> {
  for (let i = 0; i < 8; i += 1) {
    const request = await prisma.emergencyRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new OpsNotFoundError("Emergency request not found");
    if (!isActiveEmergencyStatus(request.status) || request.moderationStatus === "BLOCKED") {
      return request.status as EmergencyStatus;
    }
    if (request.expiresAt <= now) {
      await expireEmergencyRequest(request.id, now);
      return "EXPIRED";
    }
    // Searchable requests always carry coordinates (enforced at creation);
    // anything without them is unresolvable and exits through expiry.
    if (request.latitude === null || request.longitude === null) {
      await expireEmergencyRequest(request.id, now);
      return "EXPIRED";
    }
    const geo = { latitude: request.latitude, longitude: request.longitude };

    switch (request.status) {
      case "PENDING": {
        await transition(request.id, "SEARCHING_BANKS", "SEARCHING_BANKS");
        continue;
      }
      case "SEARCHING_BANKS": {
        // Cumulative bank sweep along the radius ladder — local rungs first,
        // stopping as soon as compatible stock covers the request. Banks are
        // queried (never exposed), so this phase completes in one pass.
        const ladder = radiusLadderFor(request.urgency);
        const already = await prisma.emergencyMatch.findMany({
          where: { requestId: request.id, kind: "BANK" },
          select: { organizationId: true, unitsAvailable: true },
        });
        const excludeOrgIds = already
          .map((m) => m.organizationId)
          .filter((x): x is string => x !== null);
        let cumulativeUnits = already.reduce((sum, m) => sum + (m.unitsAvailable ?? 0), 0);
        let listedNew = 0;
        for (let rung = 0; rung < ladder.length && cumulativeUnits < request.unitsRequested; rung += 1) {
          const sweep = await sweepBanks(
            { id: request.id, componentType: request.componentType, bloodGroup: request.bloodGroup, ...geo },
            ladder[rung],
            excludeOrgIds
          );
          listedNew += sweep.banks.length;
          cumulativeUnits += sweep.totalUnits;
        }
        if (cumulativeUnits >= request.unitsRequested) {
          await prisma.emergencyRequest.update({
            where: { id: request.id },
            data: {
              status: "FULFILLED",
              fulfilledAt: now,
              fulfilledSource: "BANK_INVENTORY",
            },
          });
          await addEvent(request.id, "FULFILLED", { source: "BANK_INVENTORY", units: cumulativeUnits });
          await notifyRequester(request.requesterUserId, request.id, "notify.emergency.resolvedTitle");
          await recordAudit({
            actorType: "SYSTEM",
            action: "emergency_request.fulfilled_banks",
            resourceType: "EmergencyRequest",
            resourceId: request.id,
            metadata: { banks: already.length + listedNew, units: cumulativeUnits },
          });
          return "FULFILLED";
        }
        if (listedNew > 0 || already.length > 0) {
          await addEvent(request.id, "BANKS_LISTED", {
            banks: already.length + listedNew,
            units: cumulativeUnits,
          });
        }
        // Not covered by any bank → fall back to the donor network, starting
        // at the smallest radius so donors are exposed progressively.
        await prisma.emergencyRequest.update({
          where: { id: request.id },
          data: { status: "SEARCHING_DONORS", radiusRound: 0, radiusKm: ladder[0] },
        });
        await addEvent(request.id, "SEARCHING_DONORS");
        continue;
      }
      case "SEARCHING_DONORS": {
        const dwell = dwellFor(request.urgency);
        if (request.lastDonorScanAt && now.getTime() - request.lastDonorScanAt.getTime() < dwell) {
          return "SEARCHING_DONORS"; // wait for responses before widening exposure
        }
        const notified = await sweepDonors({
          id: request.id,
          urgency: request.urgency,
          componentType: request.componentType,
          bloodGroup: request.bloodGroup,
          radiusRound: request.radiusRound,
          ...geo,
        });
        await prisma.emergencyRequest.update({
          where: { id: request.id },
          data: { lastDonorScanAt: now },
        });
        const ladder = radiusLadderFor(request.urgency);
        if (notified === 0 && request.radiusRound >= ladder.length - 1) {
          // Exhausted donors → escalate to the partner/camp network and keep
          // the request open until expiry. Never a silent dead end.
          const escalated = await prisma.emergencyRequestEvent.findFirst({
            where: { requestId: request.id, stage: "PARTNER_NETWORK_ESCALATED" },
            select: { id: true },
          });
          if (!escalated) {
            await addEvent(request.id, "PARTNER_NETWORK_ESCALATED", {});
          }
        } else if (notified === 0 && request.radiusRound < ladder.length - 1) {
          await expandRadius(request.id, request.urgency, request.radiusRound);
        }
        return "SEARCHING_DONORS";
      }
      case "DONOR_FOUND": {
        // Waiting for the requester to confirm fulfillment (or expiry).
        return "DONOR_FOUND";
      }
      default:
        return request.status as EmergencyStatus;
    }
  }
  return (await prisma.emergencyRequest.findUniqueOrThrow({ where: { id: requestId }, select: { status: true } })).status as EmergencyStatus;
}

async function notifyRequester(userId: string | null, requestId: string, titleKey: string): Promise<void> {
  if (!userId) return;
  await dispatchDonorNotification({
    userId,
    typeKey: "notify.emergency.update",
    genericTitle: true,
    titleKey,
    bodyKey: "notify.genericUpdateBody",
    relatedComponentId: requestId,
  });
}

async function expireEmergencyRequest(requestId: string, now: Date): Promise<void> {
  await prisma.emergencyRequest.update({
    where: { id: requestId },
    data: { status: "EXPIRED" },
  });
  await prisma.emergencyMatch.updateMany({
    where: { requestId, kind: "DONOR", status: "NOTIFIED" },
    data: { status: "EXPIRED", respondedAt: now },
  });
  await addEvent(requestId, "EXPIRED", {});
  await recordAudit({
    actorType: "SYSTEM",
    action: "emergency_request.expired",
    resourceType: "EmergencyRequest",
    resourceId: requestId,
    metadata: {},
  });
}

// ---------------------------------------------------------------------------
// Donor response + requester controls
// ---------------------------------------------------------------------------

export interface DonorMatchView {
  matchId: string;
  requestId: string;
  requestNumber: string;
  status: string;
  bloodGroup: string;
  componentType: string;
  unitsRequested: number;
  urgency: string;
  hospitalName: string;
  city: string;
  approxDistanceKm: number;
  requestStatus: string;
  requestExpiresAt: Date;
  notifiedAt: Date;
}

/** Donor's own match queue — full request context, no other donors' data. */
export async function listDonorMatches(donorProfileId: string): Promise<DonorMatchView[]> {
  const matches = await prisma.emergencyMatch.findMany({
    where: {
      donorProfileId,
      kind: "DONOR",
      status: { in: ["NOTIFIED", "ACCEPTED", "DECLINED"] },
    },
    orderBy: { notifiedAt: "desc" },
    take: 30,
    include: {
      request: {
        select: {
          id: true,
          requestNumber: true,
          status: true,
          componentType: true,
          bloodGroup: true,
          unitsRequested: true,
          urgency: true,
          hospitalName: true,
          city: true,
          expiresAt: true,
        },
      },
    },
  });
  return matches.map((m) => ({
    matchId: m.id,
    requestId: m.request.id,
    requestNumber: m.request.requestNumber,
    status: m.status,
    bloodGroup: m.bloodGroup,
    componentType: m.request.componentType,
    unitsRequested: m.request.unitsRequested,
    urgency: m.request.urgency,
    hospitalName: m.request.hospitalName,
    city: m.request.city,
    approxDistanceKm: approximateDistanceKm(m.distanceKm ?? 0),
    requestStatus: m.request.status,
    requestExpiresAt: m.request.expiresAt,
    notifiedAt: m.notifiedAt ?? m.createdAt,
  }));
}

export async function respondToDonorMatch(input: {
  donorProfileId: string;
  matchId: string;
  accept: boolean;
  now?: Date;
}): Promise<{ ok: boolean; reason?: "NOT_FOUND" | "NOT_OPEN" | "REQUEST_CLOSED" }> {
  const now = input.now ?? new Date();
  const match = await prisma.emergencyMatch.findUnique({
    where: { id: input.matchId },
    include: {
      request: { select: { id: true, status: true, expiresAt: true, requesterUserId: true } },
    },
  });
  if (!match || match.donorProfileId !== input.donorProfileId || match.kind !== "DONOR") {
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (match.status !== "NOTIFIED") return { ok: false, reason: "NOT_OPEN" };
  if (!isActiveEmergencyStatus(match.request.status) || match.request.expiresAt <= now) {
    return { ok: false, reason: "REQUEST_CLOSED" };
  }

  await prisma.emergencyMatch.update({
    where: { id: match.id },
    data: {
      status: input.accept ? "ACCEPTED" : "DECLINED",
      respondedAt: now,
      acceptedAt: input.accept ? now : null,
    },
  });

  if (input.accept) {
    if (match.request.status === "SEARCHING_DONORS") {
      await prisma.emergencyRequest.update({
        where: { id: match.request.id },
        data: { status: "DONOR_FOUND" },
      });
      await addEvent(match.request.id, "DONOR_ACCEPTED", {});
    }
    // The requester learns a donor stepped up — still no donor identity here.
    await notifyRequester(
      match.request.requesterUserId,
      match.request.id,
      "notify.emergency.donorFoundTitle"
    );
    await recordAudit({
      actorType: "USER",
      action: "emergency_match.accepted",
      resourceType: "EmergencyMatch",
      resourceId: match.id,
      metadata: { requestId: match.request.id },
    });
  } else {
    await recordAudit({
      actorType: "USER",
      action: "emergency_match.declined",
      resourceType: "EmergencyMatch",
      resourceId: match.id,
      metadata: { requestId: match.request.id },
    });
  }
  return { ok: true };
}

/** Requester-side resolution: called with the status token (possession) or by the logged-in requester. */
export async function confirmEmergencyRequestFulfilled(input: {
  publicToken?: string;
  requesterUserId?: string;
  requestId?: string;
  now?: Date;
}): Promise<{ ok: boolean; reason?: "NOT_FOUND" | "NOT_OPEN" }> {
  const now = input.now ?? new Date();
  const request = await prisma.emergencyRequest.findFirst({
    where: input.publicToken
      ? { publicToken: input.publicToken }
      : { id: input.requestId ?? "", requesterUserId: input.requesterUserId ?? null },
  });
  if (!request) return { ok: false, reason: "NOT_FOUND" };
  if (!isActiveEmergencyStatus(request.status)) return { ok: false, reason: "NOT_OPEN" };

  await prisma.emergencyRequest.update({
    where: { id: request.id },
    data: {
      status: "FULFILLED",
      fulfilledAt: now,
      fulfilledSource: request.fulfilledSource ?? "REQUESTER_CONFIRMED",
    },
  });
  // Any remaining notified donors can stand down.
  await prisma.emergencyMatch.updateMany({
    where: { requestId: request.id, kind: "DONOR", status: "NOTIFIED" },
    data: { status: "EXPIRED", respondedAt: now },
  });
  await addEvent(request.id, "FULFILLED", { source: "REQUESTER_CONFIRMED" });
  await recordAudit({
    actorType: input.requesterUserId ? "USER" : "SYSTEM",
    actorId: input.requesterUserId ?? null,
    action: "emergency_request.fulfilled_confirmed",
    resourceType: "EmergencyRequest",
    resourceId: request.id,
    metadata: {},
  });
  return { ok: true };
}

export async function cancelEmergencyRequest(input: {
  publicToken?: string;
  requesterUserId?: string;
  requestId?: string;
  now?: Date;
}): Promise<{ ok: boolean; reason?: "NOT_FOUND" | "NOT_OPEN" }> {
  const now = input.now ?? new Date();
  const request = await prisma.emergencyRequest.findFirst({
    where: input.publicToken
      ? { publicToken: input.publicToken }
      : { id: input.requestId ?? "", requesterUserId: input.requesterUserId ?? null },
  });
  if (!request) return { ok: false, reason: "NOT_FOUND" };
  if (!isActiveEmergencyStatus(request.status)) return { ok: false, reason: "NOT_OPEN" };
  await prisma.emergencyRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED" },
  });
  await prisma.emergencyMatch.updateMany({
    where: { requestId: request.id, kind: "DONOR", status: "NOTIFIED" },
    data: { status: "EXPIRED", respondedAt: now },
  });
  await addEvent(request.id, "CANCELLED", {});
  await recordAudit({
    actorType: input.requesterUserId ? "USER" : "SYSTEM",
    actorId: input.requesterUserId ?? null,
    action: "emergency_request.cancelled",
    resourceType: "EmergencyRequest",
    resourceId: request.id,
    metadata: {},
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Read models — public status, staff bank view, admin moderation
// ---------------------------------------------------------------------------

export interface EmergencyTimelineEntry {
  stage: string;
  createdAt: Date;
}

export interface PublicEmergencyStatus {
  requestNumber: string;
  status: EmergencyStatus;
  urgency: string;
  bloodGroup: string;
  componentType: string;
  unitsRequested: number;
  hospitalName: string;
  city: string;
  createdAt: Date;
  expiresAt: Date;
  currentRadiusKm: number | null;
  timeline: EmergencyTimelineEntry[];
  banks: Array<{
    name: string;
    areaLabel: string | null;
    approxDistanceKm: number;
    unitsAvailable: number;
  }>;
  donorProgress: { notified: number; accepted: number };
  /** Only after a donor accepts: minimal, mediated contact — never a public phone. */
  donorContact: { firstName: string; maskedPhone: string; bloodGroup: string; approxDistanceKm: number } | null;
  fulfilledSource: string | null;
}

export async function getPublicEmergencyStatus(publicToken: string): Promise<PublicEmergencyStatus | null> {
  const request = await prisma.emergencyRequest.findUnique({
    where: { publicToken },
    include: {
      matches: {
        where: { OR: [{ kind: "BANK" }, { kind: "DONOR", status: { in: ["ACCEPTED", "NOTIFIED"] } }] },
        include: {
          organization: { select: { name: true, regionLabel: true } },
        },
      },
      events: { orderBy: { createdAt: "asc" }, select: { stage: true, createdAt: true } },
    },
  });
  if (!request) return null;

  let donorContact: PublicEmergencyStatus["donorContact"] = null;
  const accepted = request.matches.filter((m) => m.kind === "DONOR" && m.status === "ACCEPTED");
  if (accepted.length > 0) {
    const match = accepted[0]!;
    const profile = await prisma.donorProfile.findUnique({
      where: { id: match.donorProfileId! },
      select: {
        bloodGroup: true,
        phoneEncrypted: true,
        user: { select: { displayName: true } },
      },
    });
    if (profile) {
      const e164 = profile.phoneEncrypted ? decryptPhone(profile.phoneEncrypted) : null;
      donorContact = {
        firstName: profile.user.displayName.split(/\s+/)[0] ?? "Donor",
        maskedPhone: e164 ? maskPhone(e164) : "—",
        bloodGroup: match.bloodGroup,
        approxDistanceKm: approximateDistanceKm(match.distanceKm ?? 0),
      };
    }
  }

  const bankMatches = request.matches.filter((m) => m.kind === "BANK");
  return {
    requestNumber: request.requestNumber,
    status: request.status as EmergencyStatus,
    urgency: request.urgency,
    bloodGroup: request.bloodGroup,
    componentType: request.componentType,
    unitsRequested: request.unitsRequested,
    hospitalName: request.hospitalName,
    city: request.city,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    currentRadiusKm: request.radiusKm,
    timeline: request.events.map((e) => ({ stage: e.stage, createdAt: e.createdAt })),
    banks: bankMatches
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
      .map((m) => ({
        name: m.organization?.name ?? "Blood bank",
        areaLabel: m.organization?.regionLabel ?? null,
        approxDistanceKm: approximateDistanceKm(m.distanceKm ?? 0),
        unitsAvailable: m.unitsAvailable ?? 0,
      })),
    donorProgress: {
      notified: request.matches.filter((m) => m.kind === "DONOR" && m.status === "NOTIFIED").length,
      accepted: accepted.length,
    },
    donorContact,
    fulfilledSource: request.fulfilledSource,
  };
}

/** Blood-bank staff view: emergency requests their inventory was matched into. */
export async function listEmergencyBankMatches(organizationId: string) {
  const matches = await prisma.emergencyMatch.findMany({
    where: { kind: "BANK", organizationId },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      request: {
        select: {
          requestNumber: true,
          status: true,
          bloodGroup: true,
          componentType: true,
          unitsRequested: true,
          urgency: true,
          hospitalName: true,
          city: true,
          expiresAt: true,
        },
      },
    },
  });
  return matches.map((m) => ({
    matchId: m.id,
    unitsAvailable: m.unitsAvailable ?? 0,
    approxDistanceKm: approximateDistanceKm(m.distanceKm ?? 0),
    request: m.request,
  }));
}

export async function listFlaggedEmergencyRequests() {
  return prisma.emergencyRequest.findMany({
    where: { moderationStatus: { in: ["FLAGGED", "BLOCKED"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      requestNumber: true,
      status: true,
      moderationStatus: true,
      flagReason: true,
      bloodGroup: true,
      unitsRequested: true,
      urgency: true,
      hospitalName: true,
      city: true,
      createdAt: true,
      expiresAt: true,
    },
  });
}

export async function setEmergencyModeration(input: {
  requestId: string;
  moderatorId: string;
  block: boolean;
  reason?: string;
}): Promise<{ ok: boolean }> {
  const request = await prisma.emergencyRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, moderationStatus: true },
  });
  if (!request) return { ok: false };
  await prisma.emergencyRequest.update({
    where: { id: request.id },
    data: {
      moderationStatus: input.block ? "BLOCKED" : "CLEAR",
      flagReason: input.block ? input.reason ?? "ADMIN_BLOCKED" : null,
    },
  });
  await recordAudit({
    actorType: "USER",
    actorId: input.moderatorId,
    action: input.block ? "emergency_request.blocked" : "emergency_request.unblocked",
    resourceType: "EmergencyRequest",
    resourceId: request.id,
    metadata: { reason: input.reason ?? null },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sweep entrypoint (cron + maintenance + status-poll driver)
// ---------------------------------------------------------------------------

export interface EmergencySweepSummary {
  expired: number;
  advanced: number;
}

export async function runEmergencySweep(now: Date = new Date()): Promise<EmergencySweepSummary> {
  const due = await prisma.emergencyRequest.findMany({
    where: { status: { in: ["PENDING", "SEARCHING_BANKS", "SEARCHING_DONORS", "DONOR_FOUND"] }, expiresAt: { lt: now } },
    select: { id: true },
    take: 100,
  });
  for (const request of due) {
    await expireEmergencyRequest(request.id, now);
  }

  const active = await prisma.emergencyRequest.findMany({
    where: {
      status: { in: ["PENDING", "SEARCHING_BANKS", "SEARCHING_DONORS"] },
      moderationStatus: { not: "BLOCKED" },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: 25,
  });
  let advanced = 0;
  for (const request of active) {
    await advanceResolution(request.id, now);
    advanced += 1;
  }
  if (due.length > 0 || advanced > 0) {
    await recordAudit({
      actorType: "SYSTEM",
      action: "emergency.sweep",
      resourceType: "EmergencyRequest",
      metadata: { expired: due.length, advanced },
    });
  }
  return { expired: due.length, advanced };
}

/** Non-production helper for demos/tests: expose the dev OTP code path. */
export function emergencyDevHint(): boolean {
  return !env.isProd;
}
