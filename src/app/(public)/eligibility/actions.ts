"use server";

import { z } from "zod";
import { assessEligibility, ELIGIBILITY_DISCLAIMER_KEY, type EligibilityAssessment } from "@/packages/domain/eligibility";
import { clientIpFrom, rateLimitPersistent, hashedLimitKey } from "@/lib/rate-limit";
import { headers } from "next/headers";

/**
 * Server-side eligibility assessment — the questionnaire logic stays in the
 * pure domain module; this wrapper adds rate limiting and ensures answers
 * are never persisted (the check is stateless by design).
 */

export interface EligibilityCheckState {
  assessment: EligibilityAssessment;
  disclaimerKey: string;
}

const AnswersSchema = z.object({
  ageYears: z.coerce.number().min(0).max(120),
  weightKg: z.coerce.number().min(0).max(300),
  lastDonationDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  feelingWell: z.boolean(),
  antibioticsLast14Days: z.boolean(),
  dentalWorkLast72h: z.boolean(),
  tattooOrPiercingLast6Months: z.boolean(),
  surgeryLast6Months: z.boolean(),
  alcoholLast24h: z.boolean(),
  pregnantOrBreastfeeding: z.boolean(),
  chronicCondition: z.boolean(),
  malariaRiskTravelLast3Months: z.boolean(),
});

export async function assessEligibilityAction(input: unknown): Promise<EligibilityCheckState | { error: string }> {
  const parsed = AnswersSchema.safeParse(input);
  if (!parsed.success) return { error: "eligibility.metaTitle" };
  const h = await headers();
  const limited = await rateLimitPersistent(
    hashedLimitKey("eligibility:check", clientIpFrom(h) ?? "anonymous"),
    30,
    60_000
  );
  if (!limited.ok) return { error: "common.errorGeneric" };

  const answers = {
    ...parsed.data,
    lastDonationDate: parsed.data.lastDonationDate || null,
  };
  return {
    assessment: assessEligibility(answers, new Date()),
    disclaimerKey: ELIGIBILITY_DISCLAIMER_KEY,
  };
}
