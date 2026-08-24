/**
 * Donor-facing disclosure view layer — deterministic rendering of stored
 * disclosure decisions and verified lifecycle events (PI-13: pure logic,
 * no AI anywhere near these paths).
 *
 * Fail-closed rules enforced here:
 * - PI-5/PI-6 provenance gate: a decision renders only while its backing
 *   LifecycleEvent is VERIFIED; PENDING renders as "awaiting verification";
 *   REJECTED never renders.
 * - PI-1 data minimization: this module only ever selects/returns coarse,
 *   whitelisted fields (org display name, source system/event ids, facility
 *   city). Recipient identity is not an input because it is never stored.
 * - PI-4: facilities appear at city tier at most (Facility.city only).
 *
 * Design: every decision path is a pure exported function; the prisma
 * wrappers at the bottom are thin query loaders used by server components.
 */
import { prisma } from "@/packages/database/client";
import { translate, DEFAULT_LOCALE, type Locale } from "@/i18n";
import type { EventType } from "@/packages/schemas/events";

// ---------------------------------------------------------------------------
// Pure core — no I/O; safe to unit-test without a database
// ---------------------------------------------------------------------------

/** Dictionary references look like "{components.RBC}" — full-value refs only. */
const DICT_REF_PATTERN = /^\{([A-Za-z][A-Za-z0-9_.]*)\}$/;

function resolveParamValue(value: string, locale: Locale): string {
  const ref = DICT_REF_PATTERN.exec(value);
  if (ref) return translate(locale, ref[1]);
  return value;
}

/** Parse stored paramsJson defensively: anything but a plain object becomes {}. */
function parseParams(paramsJson: string | null | undefined): Record<string, string> {
  if (!paramsJson) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(paramsJson);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export interface DecisionRowLike {
  /** i18n template key persisted by the disclosure engine; ""/null means none. */
  messageKey: string | null;
  /** Serialized sanitized template params ({component:"{components.RBC}"}). */
  paramsJson?: string | null;
}

/**
 * Render a stored DisclosureDecision into its final donor-safe string.
 * Params like "{components.PLASMA}" are dictionary references resolved via
 * translate(); plain strings pass through verbatim. Unknown/unrenderable
 * templates degrade to the generic "temporarily unavailable" copy (PI-3).
 */
export function renderDisclosureMessage(
  decision: DecisionRowLike,
  locale: Locale = DEFAULT_LOCALE
): string {
  if (!decision.messageKey) return translate(locale, "privacy.temporarilyUnavailable");
  const raw = parseParams(decision.paramsJson);
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) params[k] = resolveParamValue(v, locale);
  return translate(locale, decision.messageKey, params);
}

// ---------------------------------------------------------------------------
// Verified-decision gate (PI-5/PI-6)
// ---------------------------------------------------------------------------

/** Coarse audit-display provenance — never recipient data (PI-1/PI-5). */
export interface ProvenanceSummary {
  organizationName: string | null;
  sourceSystem: string | null;
  sourceEventId: string | null;
  occurredAt: Date | null;
  receivedAt: Date | null;
  verificationStatus: string | null;
}

export interface VerifiedDecisionView {
  decisionId: string;
  eventId: string;
  grantedLevel: string;
  messageKey: string;
  renderedMessage: string;
  degradedReason: string | null;
  provenance: ProvenanceSummary;
}

interface VerifiedRowLike {
  id: string;
  eventId: string;
  grantedLevel: string;
  messageKey: string;
  paramsJson: string | null;
  degradedReason: string | null;
  provenanceJson: string | null;
  event: {
    verificationStatus: string;
    sourceSystem: string;
    sourceEventId: string;
    occurredAt?: Date | null;
    receivedAt?: Date | null;
    organization?: { name?: string | null } | null;
  };
}

/**
 * Build the donor-safe decision view. Returns null unless the backing event
 * is VERIFIED (unverifiable claims are not displayed, PI-3/PI-5/PI-6).
 */
export function buildVerifiedDecisionView(
  row: VerifiedRowLike | null | undefined,
  locale: Locale = DEFAULT_LOCALE
): VerifiedDecisionView | null {
  if (!row || !row.event) return null;
  if (row.event.verificationStatus !== "VERIFIED") return null;

  let fallbackProvenance: Partial<ProvenanceSummary> = {};
  try {
    fallbackProvenance = row.provenanceJson
      ? (JSON.parse(row.provenanceJson) as Partial<ProvenanceSummary>)
      : {};
  } catch {
    fallbackProvenance = {};
  }

  // Coerce fallback dates that may be serialized as ISO strings inside provenanceJson.
  const coerceFallbackDate = (value: unknown): Date | null => {
    if (value instanceof Date) return value;
    if (typeof value === "string") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  return {
    decisionId: row.id,
    eventId: row.eventId,
    grantedLevel: row.grantedLevel,
    messageKey: row.messageKey,
    renderedMessage: renderDisclosureMessage(row, locale),
    degradedReason: row.degradedReason ?? null,
    provenance: {
      organizationName: row.event.organization?.name ?? fallbackProvenance.organizationName ?? null,
      sourceSystem: row.event.sourceSystem ?? fallbackProvenance.sourceSystem ?? null,
      sourceEventId: row.event.sourceEventId ?? fallbackProvenance.sourceEventId ?? null,
      occurredAt: row.event.occurredAt ?? coerceFallbackDate(fallbackProvenance.occurredAt) ?? null,
      receivedAt: row.event.receivedAt ?? coerceFallbackDate(fallbackProvenance.receivedAt) ?? null,
      verificationStatus:
        row.event.verificationStatus ?? fallbackProvenance.verificationStatus ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-component donor view
// ---------------------------------------------------------------------------

/** Timeline label keys — one per cataloged lifecycle event type. */
export const EVENT_LABEL_KEYS: Record<EventType, string> = {
  DONATION_COLLECTED: "privacy.event.DONATION_COLLECTED",
  DONATION_PROCESSING_STARTED: "privacy.event.DONATION_PROCESSING_STARTED",
  SCREENING_COMPLETED: "privacy.event.SCREENING_COMPLETED",
  COMPONENT_CREATED: "privacy.event.COMPONENT_CREATED",
  COMPONENT_AVAILABLE: "privacy.event.COMPONENT_AVAILABLE",
  COMPONENT_RESERVED: "privacy.event.COMPONENT_RESERVED",
  COMPONENT_TRANSFERRED: "privacy.event.COMPONENT_TRANSFERRED",
  COMPONENT_RECEIVED: "privacy.event.COMPONENT_RECEIVED",
  COMPONENT_ISSUED: "privacy.event.COMPONENT_ISSUED",
  COMPONENT_RETURNED: "privacy.event.COMPONENT_RETURNED",
  COMPONENT_TRANSFUSED: "privacy.event.COMPONENT_TRANSFUSED",
  COMPONENT_EXPIRED: "privacy.event.COMPONENT_EXPIRED",
  COMPONENT_DISCARDED: "privacy.event.COMPONENT_DISCARDED",
  COMPONENT_RECALLED: "privacy.event.COMPONENT_RECALLED",
  EVENT_CORRECTION: "privacy.event.EVENT_CORRECTION",
};

export interface TimelineEntry {
  /** occurredAt, generalized to date granularity on render (PI-4/PI-12). */
  date: Date;
  labelKey: string;
  /** Facility at city tier only; null when unknown (PI-4). */
  facilityCityTier: string | null;
}

export interface ComponentDonorView {
  componentType: string;
  derivedState: string;
  preparedAt: Date | null;
  events: TimelineEntry[];
  impactMessage: string | null;
  awaitingVerification: boolean;
}

export interface ComponentRowLike {
  componentType: string;
  currentDerivedState: string;
  preparedAt: Date | null;
}

export interface TimelineEventRowLike {
  id: string;
  eventType: string;
  occurredAt: Date;
  receivedAt: Date;
  verificationStatus: string;
  supersededByCorrection: boolean;
  facility: { city: string | null } | null;
}

/**
 * Assemble the donor view for one component.
 * - Only VERIFIED events render (PI-6); corrected originals are superseded
 *   history (PI-8) and are hidden in favor of their correction.
 * - Any PENDING event flips awaitingVerification (never invent facts).
 * - impactMessage binds to a stored DisclosureDecision when TRANSFUSED
 *   (PI-5); EXPIRED/DISCARDED/RECALLED use neutral lifecycle-complete copy.
 */
export function assembleComponentDonorView(
  component: ComponentRowLike,
  events: readonly TimelineEventRowLike[],
  transfusionDecision: DecisionRowLike | null,
  locale: Locale = DEFAULT_LOCALE
): ComponentDonorView {
  const active = events.filter((e) => !e.supersededByCorrection);
  const awaitingVerification = active.some((e) => e.verificationStatus === "PENDING");

  const timeline: TimelineEntry[] = active
    .filter((e) => e.verificationStatus === "VERIFIED")
    .filter((e) => e.eventType in EVENT_LABEL_KEYS)
    .sort(
      (a, b) =>
        a.occurredAt.getTime() - b.occurredAt.getTime() ||
        a.receivedAt.getTime() - b.receivedAt.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
    .map((e) => ({
      date: e.occurredAt,
      labelKey: EVENT_LABEL_KEYS[e.eventType as EventType],
      // City tier only — Facility carries no address and we select nothing finer.
      facilityCityTier: e.facility?.city ?? null,
    }));

  let impactMessage: string | null = null;
  if (component.currentDerivedState === "TRANSFUSED") {
    // No verified decision bound means no claim is rendered (fail closed).
    impactMessage =
      transfusionDecision && transfusionDecision.messageKey
        ? renderDisclosureMessage(transfusionDecision, locale)
        : null;
  } else if (
    component.currentDerivedState === "EXPIRED" ||
    component.currentDerivedState === "DISCARDED" ||
    component.currentDerivedState === "RECALLED"
  ) {
    impactMessage = translate(locale, "privacy.lifecycleComplete");
  }

  return {
    componentType: component.componentType,
    derivedState: component.currentDerivedState,
    preparedAt: component.preparedAt ?? null,
    events: timeline,
    impactMessage,
    awaitingVerification,
  };
}

// ---------------------------------------------------------------------------
// Thin prisma wrappers — queries only; ownership/tenant scoping (PI-9) is
// enforced by callers via requireRole/requireOrgMember before invoking these.
// ---------------------------------------------------------------------------

/** Latest decision for one event, gated on VERIFIED provenance. */
export async function getVerifiedDecisionForEvent(
  eventId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<VerifiedDecisionView | null> {
  const row = await prisma.disclosureDecision.findFirst({
    where: { eventId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      event: {
        select: {
          verificationStatus: true,
          sourceSystem: true,
          sourceEventId: true,
          occurredAt: true,
          receivedAt: true,
          organization: { select: { name: true } },
        },
      },
    },
  });
  return buildVerifiedDecisionView(row, locale);
}

/** Full donor view for one component (timeline + impact message). */
export async function getComponentDonorView(
  componentId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<ComponentDonorView | null> {
  const component = await prisma.bloodComponent.findUnique({
    where: { id: componentId },
    select: {
      componentType: true,
      currentDerivedState: true,
      preparedAt: true,
    },
  });
  if (!component) return null;

  const events = await prisma.lifecycleEvent.findMany({
    where: { componentId },
    orderBy: [{ occurredAt: "asc" }, { receivedAt: "asc" }],
    select: {
      id: true,
      eventType: true,
      occurredAt: true,
      receivedAt: true,
      verificationStatus: true,
      supersededByCorrection: true,
      facilityId: true,
    },
  });

  // Facility at city tier only (PI-4): resolve ids → city, nothing finer exists here.
  const facilityIds = [
    ...new Set(events.map((e) => e.facilityId).filter((x): x is string => typeof x === "string")),
  ];
  const facilities = facilityIds.length
    ? await prisma.facility.findMany({
        where: { id: { in: facilityIds } },
        select: { id: true, city: true },
      })
    : [];
  const cityByFacilityId = new Map(facilities.map((f) => [f.id, f.city]));

  const timelineRows: TimelineEventRowLike[] = events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    occurredAt: e.occurredAt,
    receivedAt: e.receivedAt,
    verificationStatus: e.verificationStatus,
    supersededByCorrection: e.supersededByCorrection,
    facility: { city: e.facilityId ? (cityByFacilityId.get(e.facilityId) ?? null) : null },
  }));

  const latestTransfusion = [...timelineRows]
    .reverse()
    .find(
      (e) =>
        e.verificationStatus === "VERIFIED" &&
        !e.supersededByCorrection &&
        e.eventType === "COMPONENT_TRANSFUSED"
    );

  const decision = latestTransfusion
    ? await prisma.disclosureDecision.findFirst({
        where: { eventId: latestTransfusion.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { messageKey: true, paramsJson: true },
      })
    : null;

  return assembleComponentDonorView(component, timelineRows, decision, locale);
}
