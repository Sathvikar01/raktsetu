/**
 * RaktSetu Privacy & Disclosure Engine — deterministic, fail-closed.
 * No AI/LLM anywhere near these decisions (spec §33, PI-13).
 *
 * Inputs contain ONLY data the platform legitimately stores:
 * verified event type, component type, recorded consent, cohort statistics.
 * Recipient identity is not an input because it is never stored (PI-1).
 */
import { env } from "@/lib/env";
import {
  TREATMENT_CATEGORIES,
  AGE_BANDS,
  type DisclosureLevel,
  type TreatmentCategory,
  type AgeBand,
} from "@/packages/schemas/events";

export interface ConsentSnapshot {
  level: DisclosureLevel;
  category: string | null;
  ageBand: string | null;
  patientConsentVerified: boolean;
  verifiedAt: Date;
  expiresAt?: Date | null;
}

export interface DisclosureInput {
  eventType: string;
  componentType: string | null;
  verificationStatus: "VERIFIED" | "PENDING" | "REJECTED";
  consent: ConsentSnapshot | null;
  /** Number of similar transfusions in the aggregation window for re-id floor. */
  cohortSize?: number | null;
}

export interface DisclosureOutput {
  grantedLevel: DisclosureLevel;
  messageKey: string | null;
  params: Record<string, string>;
  degradedReason: string | null;
}

const COMPONENT_LABEL_KEYS: Record<string, string> = {
  RBC: "components.RBC",
  PLASMA: "components.PLASMA",
  PLATELET: "components.PLATELET",
  WHOLE_BLOOD: "components.WHOLE_BLOOD",
  OTHER: "components.OTHER",
};

function isCategory(v: string | null | undefined): v is TreatmentCategory {
  return !!v && (TREATMENT_CATEGORIES as readonly string[]).includes(v);
}
function isAgeBand(v: string | null | undefined): v is AgeBand {
  return !!v && (AGE_BANDS as readonly string[]).includes(v);
}

/**
 * Decide what a donor may be told about one verified transfusion.
 * Degrade chain: LIMITED_ANON -> BROAD_PURPOSE -> NONE(generic) with reason.
 */
export function decideDisclosure(input: DisclosureInput): DisclosureOutput {
  // Facts only come from VERIFIED events (PI-6). Pending renders as awaiting verification.
  if (input.eventType !== "COMPONENT_TRANSFUSED") {
    return { grantedLevel: "NONE", messageKey: null, params: {}, degradedReason: "NOT_TRANSFUSION" };
  }
  if (input.verificationStatus !== "VERIFIED") {
    return {
      grantedLevel: "NONE", messageKey: "privacy.awaitingVerification",
      params: {}, degradedReason: "EVENT_NOT_VERIFIED",
    };
  }

  const generic = (): DisclosureOutput => ({
    grantedLevel: "NONE", messageKey: "privacy.transfusedGeneric", params: {},
    degradedReason: null,
  });

  const consent = input.consent;
  const componentKey = input.componentType ? COMPONENT_LABEL_KEYS[input.componentType] ?? "components.OTHER" : "components.OTHER";

  // No usable consent → LEVEL 0 generic statement only (still truthful + verified).
  if (!consent || !consent.patientConsentVerified || consent.level === "NONE") {
    if (consent && consent.level !== "NONE" && !consent.patientConsentVerified) {
      const g = generic();
      g.degradedReason = "PATIENT_CONSENT_UNVERIFIED";
      return g;
    }
    return generic();
  }

  // Expired consent fails closed.
  if (consent.expiresAt && consent.expiresAt.getTime() < Date.now()) {
    const g = generic();
    g.degradedReason = "CONSENT_EXPIRED";
    return g;
  }

  if (!isCategory(consent.category)) {
    const g = generic();
    g.degradedReason = "CATEGORY_UNKNOWN";
    return g;
  }

  const broadParams = {
    component: `{${componentKey}}`,
    category: `{categories.${consent.category}}`,
  };

  if (consent.level === "BROAD_PURPOSE" || !isAgeBand(consent.ageBand)) {
    return {
      grantedLevel: "BROAD_PURPOSE",
      messageKey: "privacy.transfusedBroadPrefix",
      params: broadParams,
      degradedReason: consent.level === "LIMITED_ANON" && !isAgeBand(consent.ageBand)
        ? "AGE_BAND_MISSING"
        : null,
    };
  }

  // LIMITED_ANON: k-anonymity floor before any extra context is rendered (PI-4).
  const cohort = input.cohortSize ?? 0;
  if (cohort < env.PRIVACY_MIN_COHORT) {
    return {
      grantedLevel: "BROAD_PURPOSE",
      messageKey: "privacy.transfusedBroadPrefix",
      params: broadParams,
      degradedReason: "COHORT_TOO_SMALL",
    };
  }

  return {
    grantedLevel: "LIMITED_ANON",
    messageKey: "privacy.transfusedLimited",
    params: {
      category: `{categories.${consent.category}}`,
      ageBand: consent.ageBand,
    },
    degradedReason: null,
  };
}

/** Neutral, non-shaming copy for expiry/discard/recall/return (AT-8). */
export function lifecycleCompleteCopy(eventType: string): { messageKey: string } | null {
  switch (eventType) {
    case "COMPONENT_EXPIRED":
    case "COMPONENT_DISCARDED":
    case "COMPONENT_RECALLED":
      return { messageKey: "privacy.lifecycleComplete" };
    default:
      return null;
  }
}

/** Whitelist guard reused when persisting hospital-submitted context. */
export function sanitizeRecipientContext(input: {
  level: DisclosureLevel;
  category?: string;
  ageBand?: string;
}): { ok: true; category: string | null; ageBand: string | null } | { ok: false; reason: string } {
  if (input.level === "NONE") return { ok: true, category: null, ageBand: null };
  if (!isCategory(input.category)) return { ok: false, reason: "CATEGORY_UNKNOWN" };
  if (input.level === "LIMITED_ANON" && input.ageBand !== undefined && !isAgeBand(input.ageBand)) {
    return { ok: false, reason: "AGE_BAND_UNKNOWN" };
  }
  return {
    ok: true,
    category: input.category,
    ageBand: input.level === "LIMITED_ANON" ? (input.ageBand ?? null) : null,
  };
}
