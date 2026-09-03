import { describe, expect, it } from "vitest";
import { assessEligibility, type EligibilityAnswers } from "@/packages/domain/eligibility";

const healthyDonor: EligibilityAnswers = {
  ageYears: 30,
  weightKg: 65,
  lastDonationDate: null,
  feelingWell: true,
  antibioticsLast14Days: false,
  dentalWorkLast72h: false,
  tattooOrPiercingLast6Months: false,
  surgeryLast6Months: false,
  alcoholLast24h: false,
  pregnantOrBreastfeeding: false,
  chronicCondition: false,
  malariaRiskTravelLast3Months: false,
};

describe("assessEligibility (rule-based questionnaire)", () => {
  it("clears a healthy adult donor", () => {
    const result = assessEligibility(healthyDonor);
    expect(result.eligible).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("blocks under-18 and flags 65+ with a clearance note", () => {
    expect(assessEligibility({ ...healthyDonor, ageYears: 17 }).blockers.map((b) => b.rule)).toEqual([
      "AGE_MIN",
    ]);
    const over65 = assessEligibility({ ...healthyDonor, ageYears: 70 });
    expect(over65.blockers[0]?.rule).toBe("AGE_MAX");
  });

  it("blocks low weight", () => {
    const result = assessEligibility({ ...healthyDonor, weightKg: 44 });
    expect(result.blockers[0]?.rule).toBe("WEIGHT");
  });

  it("enforces the 90-day whole-blood interval with days remaining", () => {
    const recent = new Date(Date.now() - 20 * 86_400_000).toISOString();
    const result = assessEligibility({ ...healthyDonor, lastDonationDate: recent });
    expect(result.eligible).toBe(false);
    expect(result.blockers[0]?.rule).toBe("INTERVAL");
    expect(result.blockers[0]?.detail).toBe("70");
  });

  it("ignores an old last-donation date", () => {
    const old = new Date(Date.now() - 120 * 86_400_000).toISOString();
    expect(assessEligibility({ ...healthyDonor, lastDonationDate: old }).eligible).toBe(true);
  });

  it("accumulates multiple blockers", () => {
    const result = assessEligibility({
      ...healthyDonor,
      pregnantOrBreastfeeding: true,
      tattooOrPiercingLast6Months: true,
      alcoholLast24h: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.rule)).toEqual(["PREGNANCY", "TATTOO", "ALCOHOL"]);
  });

  it("maps every question to its deferral rule", () => {
    // Boolean triggers where `true` defers.
    const trueCases: Array<[keyof EligibilityAnswers, string]> = [
      ["antibioticsLast14Days", "ANTIBIOTICS"],
      ["dentalWorkLast72h", "DENTAL"],
      ["surgeryLast6Months", "SURGERY"],
      ["chronicCondition", "CHRONIC"],
      ["malariaRiskTravelLast3Months", "MALARIA_TRAVEL"],
    ];
    // feelingWell defers when it is `false`.
    const notFeelingWell = assessEligibility({ ...healthyDonor, feelingWell: false });
    expect(notFeelingWell.blockers[0]?.rule).toBe("FEELING_WELL");

    for (const [key, rule] of trueCases) {
      const result = assessEligibility({ ...healthyDonor, [key]: true });
      expect(result.blockers[0]?.rule).toBe(rule);
      // every blocker carries a dictionary key
      expect(result.blockers[0]?.messageKey).toMatch(/^eligibility\.rules\./);
    }
  });

  it("handles invalid dates and numbers defensively", () => {
    expect(
      assessEligibility({ ...healthyDonor, lastDonationDate: "not-a-date" }).eligible
    ).toBe(true);
    expect(assessEligibility({ ...healthyDonor, ageYears: Number.NaN }).eligible).toBe(false);
  });
});
