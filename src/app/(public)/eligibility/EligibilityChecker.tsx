"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Alert, Card, CardBody, CardHeader, CardTitle, Input, Label, buttonClasses } from "@/packages/ui";
import { getDictionary, DEFAULT_LOCALE, translate } from "@/i18n";
import { assessEligibilityAction } from "./actions";
import type { EligibilityAssessment } from "@/packages/domain/eligibility";

/**
 * Rule-based eligibility self-check. The computation happens server-side in
 * the pure domain module; this component only collects answers and renders
 * the assessment with the mandatory medical disclaimer.
 */
export function EligibilityChecker() {
  const d = getDictionary();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EligibilityAssessment | null>(null);
  const [error, setError] = useState(false);

  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [lastDonationDate, setLastDonationDate] = useState("");
  const [answers, setAnswers] = useState<Record<string, boolean>>({
    feelingWell: true,
    antibioticsLast14Days: false,
    dentalWorkLast72h: false,
    tattooOrPiercingLast6Months: false,
    surgeryLast6Months: false,
    alcoholLast24h: false,
    pregnantOrBreastfeeding: false,
    chronicCondition: false,
    malariaRiskTravelLast3Months: false,
  });

  const QUESTIONS: Array<{ stateKey: keyof typeof answers; labelKey: keyof typeof d.eligibility }> = [
    { stateKey: "feelingWell", labelKey: "questionFeelingWell" },
    { stateKey: "antibioticsLast14Days", labelKey: "questionAntibiotics" },
    { stateKey: "dentalWorkLast72h", labelKey: "questionDental" },
    { stateKey: "tattooOrPiercingLast6Months", labelKey: "questionTattoo" },
    { stateKey: "surgeryLast6Months", labelKey: "questionSurgery" },
    { stateKey: "alcoholLast24h", labelKey: "questionAlcohol" },
    { stateKey: "pregnantOrBreastfeeding", labelKey: "questionPregnancy" },
    { stateKey: "chronicCondition", labelKey: "questionChronic" },
    { stateKey: "malariaRiskTravelLast3Months", labelKey: "questionMalaria" },
  ];

  function submit() {
    setError(false);
    setResult(null);
    startTransition(async () => {
      const response = await assessEligibilityAction({
        ageYears: Number(age),
        weightKg: Number(weight),
        lastDonationDate,
        ...answers,
      });
      if ("error" in response) {
        setError(true);
        return;
      }
      setResult(response.assessment);
    });
  }

  function boolLabel(value: boolean): string {
    return value ? d.eligibility.yes : d.eligibility.no;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{d.eligibility.heroTitle}</CardTitle>
        <p className="mt-1 text-sm text-ink-soft">{d.eligibility.heroBody}</p>
      </CardHeader>
      <CardBody className="space-y-5">
        {error ? <Alert type="error">{d.common.errorGeneric}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="el-age">{d.eligibility.ageLabel}</Label>
            <Input id="el-age" type="number" min={0} max={120} value={age} onChange={(e) => setAge(e.target.value)} />
            <p className="mt-1 text-xs text-ink-faint">{d.eligibility.ageUnit}</p>
          </div>
          <div>
            <Label htmlFor="el-weight">{d.eligibility.weightLabel}</Label>
            <Input id="el-weight" type="number" min={0} max={300} value={weight} onChange={(e) => setWeight(e.target.value)} />
            <p className="mt-1 text-xs text-ink-faint">{d.eligibility.weightUnit}</p>
          </div>
          <div>
            <Label htmlFor="el-last">{d.eligibility.lastDonationLabel}</Label>
            <Input
              id="el-last"
              type="date"
              value={lastDonationDate}
              onChange={(e) => setLastDonationDate(e.target.value)}
              placeholder={d.eligibility.lastDonationNone}
            />
          </div>
        </div>

        <fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            {QUESTIONS.map(({ stateKey, labelKey }) => (
              <label key={stateKey} htmlFor={`el-${stateKey}`} className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 px-3 py-2 text-sm">
                <span className="min-w-0 text-ink-soft">{d.eligibility[labelKey] as string}</span>
                <select
                  id={`el-${stateKey}`}
                  value={answers[stateKey] ? "yes" : "no"}
                  onChange={(e) => setAnswers((a) => ({ ...a, [stateKey]: e.target.value === "yes" }))}
                  className="shrink-0 rounded-md border border-ink/20 bg-white px-2 py-1 text-sm"
                >
                  <option value="yes">{boolLabel(true)}</option>
                  <option value="no">{boolLabel(false)}</option>
                </select>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={submit}
          disabled={pending || !age || !weight}
          className={buttonClasses("primary", "md")}
        >
          {pending ? d.eligibility.checking : d.eligibility.checkButton}
        </button>

        {result ? (
          <div className="space-y-3" role="status">
            {result.eligible ? (
              <Alert type="success" title={d.eligibility.resultEligibleTitle}>
                {d.eligibility.resultEligibleBody}
              </Alert>
            ) : (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-base font-semibold text-ink">
                  <TriangleAlert className="size-5 text-amber-600" aria-hidden />
                  {d.eligibility.resultBlockedTitle}
                </p>
                <p className="text-sm text-ink-soft">{d.eligibility.resultBlockedBody}</p>
                <ul className="space-y-1.5">
                  {result.blockers.map((blocker) => (
                    <li key={blocker.rule} className="flex items-start gap-2 rounded-lg border border-amber-600/25 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {renderRule(blocker.messageKey, blocker.detail)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Alert type="info">
              <span className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden />
                {d.eligibility.disclaimer}
              </span>
            </Alert>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function renderRule(messageKey: string, detail?: string): string {
  const template = translate(DEFAULT_LOCALE, messageKey);
  return template.replace(/\{(\w+)\}/g, (_, p) => (p === "days" ? detail ?? "" : `{${p}}`));
}
