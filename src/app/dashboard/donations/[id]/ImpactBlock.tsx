import Link from "next/link";
import { Badge } from "@/packages/ui";
import { DEFAULT_LOCALE, getDictionary, translate } from "@/i18n";
import type {
  ComponentDonorView,
  VerifiedDecisionView,
} from "@/lib/services/disclosure-view";
import { fmtDate } from "../../format";

const GRANTED_LEVEL_LABEL: Record<string, string> = {
  NONE: "privacy.levelNone",
  BROAD_PURPOSE: "privacy.levelBroad",
  LIMITED_ANON: "privacy.levelLimited",
};

const GRANTED_LEVEL_WHY_KEY: Record<string, string> = {
  NONE: "donor.provenanceLevelWhyNONE",
  BROAD_PURPOSE: "donor.provenanceLevelWhyBROAD_PURPOSE",
  LIMITED_ANON: "donor.provenanceLevelWhyLIMITED_ANON",
};

function degradedCopy(reason: string): string {
  const key = `donor.degraded.${reason}`;
  const rendered = translate(DEFAULT_LOCALE, key);
  return rendered === key ? getDictionary().donor.degradedGeneric : rendered;
}

function levelWhyCopy(grantedLevel: string): string {
  const key = GRANTED_LEVEL_WHY_KEY[grantedLevel] ?? "donor.provenanceLevelWhyFallback";
  const rendered = translate(DEFAULT_LOCALE, key);
  return rendered === key
    ? translate(DEFAULT_LOCALE, "donor.provenanceLevelWhyFallback")
    : rendered;
}

/**
 * Verified impact rendering — every string comes from disclosure-view
 * outputs (renderedMessage) or dictionary keys; provenance exposes only
 * what ProvenanceSummary whitelists (org name, source system/event ids).
 *
 * Phase A2: expandable provenance chain as <details><summary> with 4 steps:
 *  1 donor message, 2 privacy decision, 3 source event, 4 reporting org.
 * Fail-closed: when decision is null/pending, neutral awaiting copy is shown
 * and no recipient data is ever rendered (PI-1, city-tier only).
 */
export function ImpactBlock({
  view,
  decision,
}: {
  view: ComponentDonorView;
  decision: VerifiedDecisionView | null;
}) {
  const d = getDictionary();

  // -------------------------------------------------------------------------
  // Verified decision — full chain
  // -------------------------------------------------------------------------
  if (decision) {
    const levelKey = GRANTED_LEVEL_LABEL[decision.grantedLevel];
    const levelLabel = levelKey ? translate(DEFAULT_LOCALE, levelKey) : decision.grantedLevel;
    const provenanceParts = [
      decision.provenance.organizationName
        ? translate(DEFAULT_LOCALE, "donor.provenanceOrg", {
            value: decision.provenance.organizationName,
          })
        : null,
      decision.provenance.sourceSystem
        ? translate(DEFAULT_LOCALE, "donor.provenanceSourceSystem", {
            value: decision.provenance.sourceSystem,
          })
        : null,
      decision.provenance.sourceEventId
        ? translate(DEFAULT_LOCALE, "donor.provenanceSourceEvent", {
            value: decision.provenance.sourceEventId,
          })
        : null,
    ].filter((x): x is string => x !== null);

    const occurredAtLabel = decision.provenance.occurredAt
      ? translate(DEFAULT_LOCALE, "donor.provenanceStep3OccurredAtLabel", {
          date: fmtDate(decision.provenance.occurredAt),
        })
      : null;
    const receivedAtLabel = decision.provenance.receivedAt
      ? translate(DEFAULT_LOCALE, "donor.provenanceStep3ReceivedAtLabel", {
          date: fmtDate(decision.provenance.receivedAt),
        })
      : null;

    return (
      <div className="mt-4 rounded-lg border border-teal-600/20 bg-teal-50/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
          {d.donor.componentCardImpact}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">{decision.renderedMessage}</p>
        {levelKey ? (
          <p className="mt-2">
            <Badge tone="teal">{levelLabel}</Badge>
          </p>
        ) : null}
        {decision.degradedReason ? (
          <p className="mt-2 text-sm text-ink-soft">{degradedCopy(decision.degradedReason)}</p>
        ) : null}
        {provenanceParts.length > 0 ? (
          <p className="mt-2 text-xs text-ink-faint">
            {d.donor.provenanceLabel} {provenanceParts.join(" \u00B7 ")}
          </p>
        ) : null}

        <details className="group mt-3 rounded-lg border border-ink/10 bg-white/80 px-3 py-2 open:bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-teal-700 marker:hidden">
            <span>{d.donor.provenanceWhyTitle}</span>
            <span
              aria-hidden
              className="ml-2 inline-flex size-5 items-center justify-center rounded-full border border-teal-600/20 bg-teal-50 text-xs leading-none text-teal-700 transition group-open:rotate-180"
            >
              &#9662;
            </span>
          </summary>

          <div className="mt-3 border-t border-ink/5 pt-3">
            <p className="text-xs leading-relaxed text-ink-soft">{d.donor.provenanceExplainer}</p>
            <p className="mt-1 text-xs font-medium text-ink-faint">{d.donor.provenanceChainIntro}</p>

            <ol className="relative mt-4 space-y-5 border-l-2 border-teal-100 pl-6">
              {/* Step 1: Donor message */}
              <li className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white ring-4 ring-white"
                >
                  1
                </span>
                <p className="text-sm font-semibold text-ink">{d.donor.provenanceStep1Title}</p>
                <p className="mt-1 rounded-md bg-teal-50/60 px-2.5 py-2 text-sm leading-relaxed text-ink">
                  {decision.renderedMessage}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                  {d.donor.provenanceStep1Body}
                </p>
              </li>

              {/* Step 2: Privacy decision */}
              <li className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white ring-4 ring-white"
                >
                  2
                </span>
                <p className="text-sm font-semibold text-ink">{d.donor.provenanceStep2Title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{d.donor.provenanceStep2Body}</p>
                <p className="mt-2">
                  <Badge tone="teal">
                    {translate(DEFAULT_LOCALE, "donor.provenanceLevelLabel", { level: levelLabel })}
                  </Badge>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{levelWhyCopy(decision.grantedLevel)}</p>
                {decision.degradedReason ? (
                  <div className="mt-2 rounded-md border border-amber-200/50 bg-amber-50/50 px-2.5 py-2">
                    <p className="text-xs font-medium text-amber-800">{d.donor.provenanceStep2DegradedLabel}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                      {degradedCopy(decision.degradedReason)}
                    </p>
                  </div>
                ) : null}
              </li>

              {/* Step 3: Source event */}
              <li className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white ring-4 ring-white"
                >
                  3
                </span>
                <p className="text-sm font-semibold text-ink">{d.donor.provenanceStep3Title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="green">{d.donor.provenanceStep3VerifiedBadge}</Badge>
                  <span className="text-xs text-ink-faint">
                    {decision.provenance.verificationStatus ?? d.donor.provenanceStep3VerifiedBadge}
                  </span>
                </p>
                <div className="mt-2 space-y-1 text-xs text-ink-soft">
                  {decision.provenance.sourceSystem ? (
                    <p>
                      {translate(DEFAULT_LOCALE, "donor.provenanceStep3SourceSystemLabel", {
                        value: decision.provenance.sourceSystem,
                      })}
                    </p>
                  ) : null}
                  {decision.provenance.sourceEventId ? (
                    <p>
                      {translate(DEFAULT_LOCALE, "donor.provenanceStep3SourceEventLabel", {
                        value: decision.provenance.sourceEventId,
                      })}
                    </p>
                  ) : null}
                  {occurredAtLabel ? <p>{occurredAtLabel}</p> : null}
                  {receivedAtLabel ? <p>{receivedAtLabel}</p> : null}
                  {!occurredAtLabel && !receivedAtLabel ? (
                    <p className="text-ink-faint">{d.donor.provenanceStep3DatesNote}</p>
                  ) : (
                    <p className="pt-1 text-[11px] leading-relaxed text-ink-faint">
                      {d.donor.provenanceStep3DatesNote}
                    </p>
                  )}
                </div>
              </li>

              {/* Step 4: Reporting organization */}
              <li className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white ring-4 ring-white"
                >
                  4
                </span>
                <p className="text-sm font-semibold text-ink">{d.donor.provenanceStep4Title}</p>
                {decision.provenance.organizationName ? (
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                    {translate(DEFAULT_LOCALE, "donor.provenanceStep4VerifiedBy", {
                      organizationName: decision.provenance.organizationName,
                    })}
                  </p>
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{d.donor.provenanceStep4NoOrg}</p>
                )}
                <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">{d.donor.provenanceStep4Note}</p>
              </li>
            </ol>

            <Link
              href="/privacy"
              className="mt-4 inline-flex items-center text-xs font-medium text-teal-700 underline-offset-4 hover:underline"
            >
              {d.donor.provenancePrivacyLinkLabel} &rarr;
            </Link>
          </div>
        </details>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Fail-closed: awaiting verification (pending) — neutral, no clinical detail
  // -------------------------------------------------------------------------
  // Transfused without a verified decision is always awaiting (fail-closed, PI-5/PI-6).
  // A generic pending flag with no impact message also shows awaiting, but lifecycle-
  // complete messages (EXPIRED/DISCARDED/RECALLED) take precedence when present.
  const shouldShowAwaiting =
    view.derivedState === "TRANSFUSED" || (view.awaitingVerification && !view.impactMessage);
  if (shouldShowAwaiting) {
      return (
        <div className="mt-4 rounded-lg border border-amber-600/20 bg-amber-50/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            {d.donor.componentCardImpact}
          </p>
          <p className="mt-1.5 text-sm font-medium text-ink">{d.donor.provenanceAwaitingTitle}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{d.donor.provenanceAwaitingBody}</p>

          <details className="group mt-3 rounded-lg border border-ink/10 bg-white/80 px-3 py-2 open:bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-ink-soft marker:hidden">
              <span>{d.donor.provenanceWhyTitle}</span>
              <span
                aria-hidden
                className="ml-2 inline-flex size-5 items-center justify-center rounded-full border border-ink/10 bg-white text-xs leading-none text-ink-faint transition group-open:rotate-180"
              >
                &#9662;
              </span>
            </summary>
            <div className="mt-3 border-t border-ink/5 pt-3">
              <p className="text-xs leading-relaxed text-ink-soft">{d.donor.provenanceExplainer}</p>
              <p className="mt-1 text-xs font-medium text-ink-faint">{d.donor.provenanceAwaitingNote}</p>

              <ol className="relative mt-4 space-y-5 border-l-2 border-amber-100 pl-6">
                <li className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white ring-4 ring-white"
                  >
                    1
                  </span>
                  <p className="text-sm font-semibold text-ink">{d.donor.provenanceStep1Title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{d.donor.provenanceAwaitingBody}</p>
                </li>
                <li className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white ring-4 ring-white"
                  >
                    2
                  </span>
                  <p className="text-sm font-semibold text-ink">{d.donor.provenanceStep2Title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{d.donor.provenanceStep2Body}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-faint">{d.donor.provenanceAwaitingNote}</p>
                </li>
                <li className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white ring-4 ring-white"
                  >
                    3
                  </span>
                  <p className="text-sm font-semibold text-ink">{d.donor.provenanceStep3Title}</p>
                  <p className="mt-1">
                    <Badge tone="amber">{d.donor.provenanceAwaitingTitle}</Badge>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{d.donor.provenanceStep3DatesNote}</p>
                </li>
                <li className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white ring-4 ring-white"
                  >
                    4
                  </span>
                  <p className="text-sm font-semibold text-ink">{d.donor.provenanceStep4Title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{d.donor.provenanceStep4NoOrg}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-faint">{d.donor.provenanceStep4Note}</p>
                </li>
              </ol>

              <Link
                href="/privacy"
                className="mt-4 inline-flex items-center text-xs font-medium text-teal-700 underline-offset-4 hover:underline"
              >
                {d.donor.provenancePrivacyLinkLabel} &rarr;
              </Link>
            </div>
          </details>
        </div>
      );
    }

  if (view.impactMessage) {
    return (
      <div className="mt-4 rounded-lg border border-ink/10 bg-white px-4 py-3">
        <p className="text-sm leading-relaxed text-ink-soft">{view.impactMessage}</p>
      </div>
    );
  }

  return null;
}
