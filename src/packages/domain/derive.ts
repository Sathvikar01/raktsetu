import type { ComponentType, EventType, VerificationStatus } from "@/packages/schemas/events";

/** Derived per-component states (never authoritative; events are truth). */
export const COMPONENT_STATES = [
  "PREPARING",     // created but not yet released
  "AVAILABLE",
  "RESERVED",
  "TRANSFERRED",
  "RECEIVED",
  "ISSUED",
  "RETURNED",
  "TRANSFUSED",
  "EXPIRED",
  "DISCARDED",
  "RECALLED",
] as const;
export type ComponentState = (typeof COMPONENT_STATES)[number];

export const TERMINAL_STATES: ComponentState[] = ["TRANSFUSED", "EXPIRED", "DISCARDED", "RECALLED"];

export interface DerivedEventView {
  id: string;
  eventType: EventType;
  occurredAt: Date;
  receivedAt: Date;
  verificationStatus: VerificationStatus;
  organizationId: string;
  facilityId: string | null;
  sourceSystem: string;
  sourceEventId: string;
  correctionForEventId: string | null;
  payload: Record<string, unknown>;
}

export interface DerivationResult<T> {
  state: T | null;
  lastVerifiedEvent: DerivedEventView | null;
  /** Facility of the last verified, non-superseded event — the component's current location. */
  lastFacilityId: string | null;
  awaitingVerification: boolean;
  flags: DerivationFlag[];
}

export type DerivationFlag =
  | "OUT_OF_ORDER_EVENTS"
  | "EVENT_AFTER_TERMINAL"
  | "CORRECTED_EVENT_PRESENT"
  | "UNEXPECTED_SEQUENCE";

/**
 * Pure derivation of current state from ordered lifecycle events.
 * Clinical history must fail safely: PENDING events never advance state;
 * REJECTED events are ignored entirely; corrections supersede their target.
 */
export function deriveComponentState(
  events: DerivedEventView[]
): DerivationResult<ComponentState> {
  const flags: DerivationFlag[] = [];
  const corrected = new Set(
    events.filter((e) => e.correctionForEventId).map((e) => e.correctionForEventId!)
  );
  if (corrected.size > 0) flags.push("CORRECTED_EVENT_PRESENT");

  const usable = events
    .filter((e) => e.verificationStatus !== "REJECTED")
    .filter((e) => !corrected.has(e.id))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.receivedAt.getTime() - b.receivedAt.getTime());

  let state: ComponentState | null = null;
  let lastVerifiedEvent: DerivedEventView | null = null;
  let awaitingVerification = false;

  const ORDER: Record<string, number> = {
    PREPARING: 0, AVAILABLE: 1, RESERVED: 2, TRANSFERRED: 3,
    RECEIVED: 4, ISSUED: 5, RETURNED: 4, TRANSFUSED: 8,
    EXPIRED: 8, DISCARDED: 8, RECALLED: 8,
  };

  for (const e of usable) {
    if (e.verificationStatus === "PENDING") {
      awaitingVerification = true;
      continue;
    }
    const next = applyComponentEvent(state, e.eventType);
    if (next === undefined) continue;
    if (next === state) {
      // duplicate-ish transition; ignore silently but flag odd sequences
      continue;
    }
    if (state !== null && ORDER[next] < ORDER[state]) {
      flags.push("OUT_OF_ORDER_EVENTS");
    }
    if (state !== null && TERMINAL_STATES.includes(state)) {
      flags.push("EVENT_AFTER_TERMINAL");
      break;
    }
    state = next;
    lastVerifiedEvent = e;
  }

  return {
    state,
    lastVerifiedEvent,
    lastFacilityId: lastVerifiedEvent?.facilityId ?? null,
    awaitingVerification,
    flags,
  };
}

function applyComponentEvent(current: ComponentState | null, t: EventType): ComponentState | undefined {
  switch (t) {
    case "COMPONENT_CREATED": return current ? undefined : "PREPARING";
    case "COMPONENT_AVAILABLE": return current === "PREPARING" || current === "AVAILABLE" ? "AVAILABLE" : undefined;
    case "COMPONENT_RESERVED": return current === "AVAILABLE" || current === "RESERVED" ? "RESERVED" : undefined;
    case "COMPONENT_TRANSFERRED":
      return current === "AVAILABLE" || current === "RESERVED" ? "TRANSFERRED" : undefined;
    case "COMPONENT_RECEIVED": return current === "TRANSFERRED" ? "RECEIVED" : undefined;
    case "COMPONENT_ISSUED": return current === "RECEIVED" || current === "ISSUED" ? "ISSUED" : undefined;
    case "COMPONENT_RETURNED": return current === "TRANSFERRED" || current === "RECEIVED" || current === "ISSUED" ? "RECEIVED" : undefined;
    case "COMPONENT_TRANSFUSED":
      return ["AVAILABLE", "RESERVED", "RECEIVED", "ISSUED"].includes(current ?? "") ? "TRANSFUSED" : undefined;
    case "COMPONENT_EXPIRED": return current && current !== "EXPIRED" ? "EXPIRED" : undefined;
    case "COMPONENT_DISCARDED": return current && current !== "DISCARDED" ? "DISCARDED" : undefined;
    case "COMPONENT_RECALLED": return current ? "RECALLED" : undefined;
    default: return undefined;
  }
}

/** Donation-level progress steps for donor UI (only VERIFIED events count). */
export interface DonationProgress {
  collected: boolean;
  processingCompleted: boolean;
  componentsReady: boolean;
  patientCareReached: boolean;
}

export function deriveDonationProgress(
  donationEvents: DerivedEventView[],
  components: Array<{ state: ComponentState | null }>
): DonationProgress {
  const corrected = new Set(donationEvents.filter((e) => e.correctionForEventId).map((e) => e.correctionForEventId!));
  const ok = donationEvents.filter(
    (e) => e.verificationStatus === "VERIFIED" && !corrected.has(e.id)
  );
  return {
    collected: ok.some((e) => e.eventType === "DONATION_COLLECTED"),
    processingCompleted: ok.some((e) => e.eventType === "SCREENING_COMPLETED"),
    componentsReady: ok.some((e) => e.eventType === "COMPONENT_CREATED") || components.some((c) => c.state),
    patientCareReached: components.some((c) => c.state === "TRANSFUSED"),
  };
}
