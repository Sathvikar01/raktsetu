/**
 * Repeat-donation eligibility windows (days), used for the donor-facing
 * "you can donate again" countdown and the opt-in reminder sweep.
 *
 * Whole blood follows the conservative NBTC-style 3-month guidance used by
 * Indian centres (the platform's primary deployment context); apheresis kinds
 * anticipate future donation-kind records. This is engagement guidance only —
 * final eligibility is always the blood bank's screening decision, and donor
 * copy must say so (no clinical claims: the platform is not a medical device).
 */
export type DonationKind =
  | "WHOLE_BLOOD"
  | "PLATELET_APHERESIS"
  | "PLASMA_APHERESIS"
  | "DOUBLE_RBC";

export const DONATION_INTERVAL_DAYS: Record<DonationKind, number> = {
  WHOLE_BLOOD: 90,
  PLATELET_APHERESIS: 14,
  PLASMA_APHERESIS: 28,
  DOUBLE_RBC: 180,
};

export const DEFAULT_DONATION_KIND: DonationKind = "WHOLE_BLOOD";

export function nextEligibleAt(lastDonatedAt: Date, kind: DonationKind = DEFAULT_DONATION_KIND): Date {
  return new Date(lastDonatedAt.getTime() + DONATION_INTERVAL_DAYS[kind] * 86_400_000);
}

export interface EligibilityWindow {
  /** True when `now` is on/after the next eligible date (or no donation yet). */
  eligible: boolean;
  /** null when there is no prior donation to count from. */
  nextEligibleAt: Date | null;
  /** Whole days until eligible, floored at 0. Day granularity only (PI-4). */
  daysRemaining: number;
}

export function eligibilityWindow(
  now: Date,
  lastDonatedAt: Date | null,
  kind: DonationKind = DEFAULT_DONATION_KIND
): EligibilityWindow {
  if (!lastDonatedAt) {
    return { eligible: true, nextEligibleAt: null, daysRemaining: 0 };
  }
  const next = nextEligibleAt(lastDonatedAt, kind);
  const daysRemaining = Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 86_400_000));
  return { eligible: daysRemaining === 0, nextEligibleAt: next, daysRemaining };
}

// ---------------------------------------------------------------------------
// Pre-donation eligibility questionnaire (rule-based, self-declared)
// ---------------------------------------------------------------------------

/**
 * Conservative, NBTC-style screening self-check used in two places: donor
 * onboarding (declared history) and the public "can I donate?" tool. Every
 * rule maps to an i18n key under `eligibility.rules.*`; the UI must always
 * render `eligibility.disclaimer` alongside any result — final eligibility is
 * exclusively a medical professional's decision at the donation centre.
 */
export interface EligibilityAnswers {
  ageYears: number;
  weightKg: number;
  /** ISO date of the donor's last whole-blood donation, if any. */
  lastDonationDate?: string | null;
  /** No fever / cold / infection symptoms in the last 14 days. */
  feelingWell: boolean;
  antibioticsLast14Days: boolean;
  dentalWorkLast72h: boolean;
  tattooOrPiercingLast6Months: boolean;
  surgeryLast6Months: boolean;
  alcoholLast24h: boolean;
  pregnantOrBreastfeeding: boolean;
  /** Heart disease, cancer, bleeding/clotting disorder, diabetes on insulin, etc. */
  chronicCondition: boolean;
  /** Travel to a malaria-endemic area in the last 3 months. */
  malariaRiskTravelLast3Months: boolean;
}

export type EligibilityRule =
  | "AGE_MIN"
  | "AGE_MAX"
  | "WEIGHT"
  | "INTERVAL"
  | "FEELING_WELL"
  | "ANTIBIOTICS"
  | "DENTAL"
  | "TATTOO"
  | "SURGERY"
  | "ALCOHOL"
  | "PREGNANCY"
  | "CHRONIC"
  | "MALARIA_TRAVEL";

export interface EligibilityAssessment {
  /** True only when NO rule blocks donation. Never a clinical clearance. */
  eligible: boolean;
  /** Blocking rules with their i18n message key (`eligibility.rules.<id>`). */
  blockers: Array<{ rule: EligibilityRule; messageKey: string; detail?: string }>;
}

export const ELIGIBILITY_DISCLAIMER_KEY = "eligibility.disclaimer";

export function assessEligibility(
  answers: EligibilityAnswers,
  now: Date = new Date()
): EligibilityAssessment {
  const blockers: EligibilityAssessment["blockers"] = [];

  if (!Number.isFinite(answers.ageYears) || answers.ageYears < 18) {
    blockers.push({ rule: "AGE_MIN", messageKey: "eligibility.rules.AGE_MIN" });
  } else if (answers.ageYears > 65) {
    blockers.push({
      rule: "AGE_MAX",
      messageKey: "eligibility.rules.AGE_MAX",
      detail: String(answers.ageYears),
    });
  }
  if (!Number.isFinite(answers.weightKg) || answers.weightKg < 45) {
    blockers.push({ rule: "WEIGHT", messageKey: "eligibility.rules.WEIGHT" });
  }
  if (answers.pregnantOrBreastfeeding) {
    blockers.push({ rule: "PREGNANCY", messageKey: "eligibility.rules.PREGNANCY" });
  }
  if (answers.chronicCondition) {
    blockers.push({ rule: "CHRONIC", messageKey: "eligibility.rules.CHRONIC" });
  }
  if (answers.lastDonationDate) {
    const last = new Date(answers.lastDonationDate);
    if (!Number.isNaN(last.getTime())) {
      const window = eligibilityWindow(now, last);
      if (!window.eligible) {
        blockers.push({
          rule: "INTERVAL",
          messageKey: "eligibility.rules.INTERVAL",
          detail: String(window.daysRemaining),
        });
      }
    }
  }
  if (!answers.feelingWell) {
    blockers.push({ rule: "FEELING_WELL", messageKey: "eligibility.rules.FEELING_WELL" });
  }
  if (answers.antibioticsLast14Days) {
    blockers.push({ rule: "ANTIBIOTICS", messageKey: "eligibility.rules.ANTIBIOTICS" });
  }
  if (answers.dentalWorkLast72h) {
    blockers.push({ rule: "DENTAL", messageKey: "eligibility.rules.DENTAL" });
  }
  if (answers.tattooOrPiercingLast6Months) {
    blockers.push({ rule: "TATTOO", messageKey: "eligibility.rules.TATTOO" });
  }
  if (answers.surgeryLast6Months) {
    blockers.push({ rule: "SURGERY", messageKey: "eligibility.rules.SURGERY" });
  }
  if (answers.alcoholLast24h) {
    blockers.push({ rule: "ALCOHOL", messageKey: "eligibility.rules.ALCOHOL" });
  }
  if (answers.malariaRiskTravelLast3Months) {
    blockers.push({ rule: "MALARIA_TRAVEL", messageKey: "eligibility.rules.MALARIA_TRAVEL" });
  }

  return { eligible: blockers.length === 0, blockers };
}
