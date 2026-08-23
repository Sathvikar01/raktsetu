import { Badge } from "@/packages/ui";
import { DEFAULT_LOCALE, getDictionary, translate } from "@/i18n";
import type {
  ComponentDonorView,
  VerifiedDecisionView,
} from "@/lib/services/disclosure-view";

const GRANTED_LEVEL_LABEL: Record<string, string> = {
  NONE: "privacy.levelNone",
  BROAD_PURPOSE: "privacy.levelBroad",
  LIMITED_ANON: "privacy.levelLimited",
};

function degradedCopy(reason: string): string {
  const key = `donor.degraded.${reason}`;
  const rendered = translate(DEFAULT_LOCALE, key);
  return rendered === key ? getDictionary().donor.degradedGeneric : rendered;
}

/**
 * Verified impact rendering — every string comes from disclosure-view
 * outputs (renderedMessage) or dictionary keys; provenance exposes only
 * what ProvenanceSummary whitelists (org name, source system/event ids).
 */
export function ImpactBlock({
  view,
  decision,
}: {
  view: ComponentDonorView;
  decision: VerifiedDecisionView | null;
}) {
  const d = getDictionary();

  if (decision) {
    const levelKey = GRANTED_LEVEL_LABEL[decision.grantedLevel];
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

    return (
      <div className="mt-4 rounded-lg border border-teal-600/20 bg-teal-50/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
          {d.donor.componentCardImpact}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">{decision.renderedMessage}</p>
        {levelKey ? (
          <p className="mt-2">
            <Badge tone="teal">{translate(DEFAULT_LOCALE, levelKey)}</Badge>
          </p>
        ) : null}
        {decision.degradedReason ? (
          <p className="mt-2 text-sm text-ink-soft">{degradedCopy(decision.degradedReason)}</p>
        ) : null}
        {provenanceParts.length > 0 ? (
          <p className="mt-2 text-xs text-ink-faint">
            {d.donor.provenanceLead} {provenanceParts.join(" · ")}
          </p>
        ) : null}
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
