/**
 * Emergency request lifecycle state machine — pure constants and helpers.
 *
 * Pipeline: EMERGENCY_REQUEST -> NEARBY BLOOD BANKS -> COMPATIBLE INVENTORY ->
 * NEARBY VERIFIED DONORS -> EXPANDED RADIUS -> PARTNER/CAMP NETWORK.
 * The pipeline never ends in a dead end: while a request is active and before
 * expiry, every stage escalation is automatic and recorded as a timeline event.
 */

/** Urgency levels mirror the org-to-org request flow (services/requests). */
export type RequestUrgency = "ROUTINE" | "URGENT" | "EMERGENCY";
export const REQUEST_URGENCIES: RequestUrgency[] = ["ROUTINE", "URGENT", "EMERGENCY"];

export const EMERGENCY_STATUSES = [
  "PENDING",
  "SEARCHING_BANKS",
  "SEARCHING_DONORS",
  "DONOR_FOUND",
  "FULFILLED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[number];

export const ACTIVE_EMERGENCY_STATUSES: EmergencyStatus[] = [
  "PENDING",
  "SEARCHING_BANKS",
  "SEARCHING_DONORS",
  "DONOR_FOUND",
];

export function isActiveEmergencyStatus(status: string): boolean {
  return ACTIVE_EMERGENCY_STATUSES.includes(status as EmergencyStatus);
}

/**
 * Progressive radius ladder per urgency (kilometres). Search starts local and
 * only widens after the previous rung had a chance to surface sources —
 * a small immediate pool instead of exposing the whole city at once.
 */
export const EMERGENCY_RADIUS_LADDER: Record<RequestUrgency, number[]> = {
  EMERGENCY: [3, 7, 15, 30, 60, 120],
  URGENT: [5, 12, 25, 50, 100],
  ROUTINE: [10, 25, 60, 120],
};

/**
 * How long a radius rung stays "open" for donors to respond before the search
 * automatically widens (and, within the same rung, re-scans for new donors).
 */
export const ROUND_DWELL_MS: Record<RequestUrgency, number> = {
  EMERGENCY: 60_000,
  URGENT: 3 * 60_000,
  ROUTINE: 10 * 60_000,
};

/** Whole-blood replacement viability window before a request auto-expires. */
export const EXPIRY_HOURS: Record<RequestUrgency, number> = {
  EMERGENCY: 6,
  URGENT: 24,
  ROUTINE: 72,
};

/** Donors notified per radius rung — progressive exposure, never a blast. */
export const DONORS_PER_ROUND = 12;
/** Hard cap on donor notifications per request across all rounds. */
export const MAX_DONOR_NOTIFICATIONS = 40;

/** Widest bank sweep before the donor fallback starts (banks are sweeped cumulatively up to the current rung). */
export const MAX_BANKS_LISTED = 8;

export function radiusLadderFor(urgency: string): number[] {
  return EMERGENCY_RADIUS_LADDER[(urgency as RequestUrgency) in EMERGENCY_RADIUS_LADDER ? (urgency as RequestUrgency) : "ROUTINE"];
}

export function dwellFor(urgency: string): number {
  return ROUND_DWELL_MS[(urgency as RequestUrgency) in ROUND_DWELL_MS ? (urgency as RequestUrgency) : "ROUTINE"];
}

export function expiryHoursFor(urgency: string): number {
  return EXPIRY_HOURS[(urgency as RequestUrgency) in EXPIRY_HOURS ? (urgency as RequestUrgency) : "ROUTINE"];
}

export interface StageMeta {
  key: string; // i18n key suffix under emergency.stage
  step: number; // stepper position (0-3); -1 for terminal exits
}

/** Stepper positions for the live status UI. */
export function stageMeta(status: string): StageMeta {
  switch (status) {
    case "PENDING": return { key: "pending", step: 0 };
    case "SEARCHING_BANKS": return { key: "searchingBanks", step: 1 };
    case "SEARCHING_DONORS": return { key: "searchingDonors", step: 2 };
    case "DONOR_FOUND": return { key: "donorFound", step: 3 };
    case "FULFILLED": return { key: "fulfilled", step: 4 };
    case "EXPIRED": return { key: "expired", step: -1 };
    case "CANCELLED": return { key: "cancelled", step: -1 };
    default: return { key: "pending", step: 0 };
  }
}

export const EMERGENCY_STAGE_EVENT_KEYS = [
  "REQUEST_CREATED",
  "SEARCHING_BANKS",
  "BANKS_LISTED",
  "SEARCHING_DONORS",
  "DONORS_NOTIFIED",
  "DONOR_ACCEPTED",
  "RADIUS_EXPANDED",
  "PARTNER_NETWORK_ESCALATED",
  "FULFILLED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type EmergencyStageEventKey = (typeof EMERGENCY_STAGE_EVENT_KEYS)[number];
