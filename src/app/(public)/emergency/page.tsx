import type { Metadata } from "next";
import { Droplets, Hospital, Radio, Siren } from "lucide-react";
import { Alert, Card, CardBody, SectionHeading } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { EMERGENCY_RADIUS_LADDER } from "@/packages/domain/emergency";
import { EmergencyWizard } from "./EmergencyWizard";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.emergency.metaTitle, description: d.emergency.metaDescription };
}

const PIPELINE_ICONS = [Hospital, Droplets, Siren, Radio] as const;

export default function EmergencyPage() {
  const d = getDictionary();
  const pipelineSteps = [
    d.emergency.pipelineBanks,
    d.emergency.pipelineInventory,
    d.emergency.pipelineDonors,
    d.emergency.pipelineRadius,
    d.emergency.pipelineNetwork,
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      <section className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-crimson-700">
          {d.emergency.heroKicker}
        </p>
        <h1 className="max-w-3xl font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {d.emergency.heroTitle}
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-ink-soft">{d.emergency.heroBody}</p>
        <div className="flex flex-wrap gap-2 text-xs text-ink-faint">
          {(["EMERGENCY", "URGENT", "ROUTINE"] as const).map((u) => (
            <span key={u} className="rounded-full border border-ink/10 bg-white px-3 py-1">
              {d.requests[`urgency${u}` as keyof typeof d.requests] as string}:{" "}
              {EMERGENCY_RADIUS_LADDER[u].map((r) => `~${r} km`).join(" → ")}
            </span>
          ))}
        </div>
      </section>

      <section aria-labelledby="pipeline-heading" className="space-y-4">
        <SectionHeading title={d.emergency.pipelineTitle} id="pipeline-heading" />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {pipelineSteps.map((label, i) => {
            const Icon = PIPELINE_ICONS[i % PIPELINE_ICONS.length]!;
            return (
              <li key={label} className="rounded-2xl border border-ink/10 bg-white p-4">
                <Icon className="size-5 text-crimson-600" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-ink">{label}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{String(i + 1).padStart(2, "0")}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <EmergencyWizard />
        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-2">
              <h2 className="text-base font-semibold text-ink">{d.emergency.disclaimerTitle}</h2>
              <p className="text-sm leading-relaxed text-ink-soft">{d.emergency.disclaimerBody}</p>
            </CardBody>
          </Card>
          <Alert type="info">{d.emergency.privacyNote}</Alert>
        </div>
      </div>
    </div>
  );
}
