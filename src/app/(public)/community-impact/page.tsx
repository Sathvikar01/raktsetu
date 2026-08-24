import type { Metadata } from "next";
import { BarChart3, ShieldCheck } from "lucide-react";
import { getCommunityStats } from "@/lib/services/stats";
import { DEFAULT_LOCALE, getDictionary } from "@/i18n";
import {
  Alert,
  BarChart,
  EmptyState,
  SectionHeading,
  StatTile,
} from "@/packages/ui";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.impactTitle, description: d.public.impactIntro };
}

export default async function CommunityImpactPage() {
  const d = getDictionary();
  const stats = await getCommunityStats();
  const fmt = new Intl.NumberFormat(DEFAULT_LOCALE);

  const hasAny =
    stats.donationsTracked > 0 ||
    stats.componentsProcessed > 0 ||
    stats.transfusionEvents > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <SectionHeading
        headingLevel="h1"
        kicker={d.public.impactKicker}
        title={d.public.impactTitle}
        body={d.public.impactIntro}
      />

      <div className="mt-12">
        {hasAny ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile value={fmt.format(stats.donationsTracked)} label={d.public.statsDonations} />
            <StatTile
              value={fmt.format(stats.componentsProcessed)}
              label={d.public.statsComponents}
            />
            <StatTile
              value={fmt.format(stats.transfusionEvents)}
              label={d.public.statsTransfusions}
            />
            <StatTile value={fmt.format(stats.bloodCentres)} label={d.public.statsCentres} />
            <StatTile value={fmt.format(stats.hospitals)} label={d.public.statsHospitals} />
          </div>
        ) : (
          <EmptyState icon={BarChart3} title={d.public.statsEmpty} body={d.public.impactEmpty} />
        )}
      </div>

      {stats.byComponentType.length > 0 ? (
        <section aria-labelledby="by-type-heading" className="mt-14 rs-card p-6">
          <h2 id="by-type-heading" className="text-lg font-semibold tracking-tight text-ink">
            {d.public.chartByTypeLabel}
          </h2>
          <div className="mt-6">
            <BarChart data={stats.byComponentType} ariaLabel={d.public.chartByTypeLabel} />
          </div>
        </section>
      ) : null}

      {stats.monthlyDonations.length > 0 ? (
        <section aria-labelledby="by-month-heading" className="mt-8 rs-card p-6">
          <h2 id="by-month-heading" className="text-lg font-semibold tracking-tight text-ink">
            {d.public.chartByMonthLabel}
          </h2>
          <div className="mt-6">
            <BarChart
              data={stats.monthlyDonations.map((m) => ({ label: m.month, count: m.count }))}
              ariaLabel={d.public.chartByMonthLabel}
            />
          </div>
        </section>
      ) : null}

      <div className="mt-12 space-y-4">
        <Alert type="info">
          <span className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {d.public.impactSuppressionNote}
          </span>
        </Alert>
      </div>
    </div>
  );
}
