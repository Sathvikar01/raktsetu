import { getCommunityStats } from "@/lib/services/stats";
import { DEFAULT_LOCALE, getDictionary } from "@/i18n";
import { Badge } from "@/packages/ui";
import { StatTile } from "@/packages/ui";
import Link from "next/link";

const formatter = new Intl.NumberFormat(DEFAULT_LOCALE);

export async function CommunityStatsTeaser() {
  const d = getDictionary();
  const stats = await getCommunityStats();
  const total =
    stats.donationsTracked + stats.componentsProcessed + stats.transfusionEvents > 0;

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile value={formatter.format(stats.donationsTracked)} label={d.public.statsDonations} />
        <StatTile
          value={formatter.format(stats.componentsProcessed)}
          label={d.public.statsComponents}
        />
        <StatTile
          value={formatter.format(stats.transfusionEvents)}
          label={d.public.statsTransfusions}
        />
      </div>
      <p className="mt-6 text-center">
        <Link
          href="/community-impact"
          className="inline-flex items-center gap-1.5 rounded-lg px-1 font-medium text-teal-700 underline-offset-4 transition-colors hover:text-teal-600 hover:underline focus-visible:underline"
        >
          {total ? d.public.statsViewAll : d.public.statsEmpty}
        </Link>
      </p>
    </div>
  );
}

export function DemoParticipantsPreview() {
  const d = getDictionary();
  const orgs = [
    {
      name: d.public.demoOrgName1,
      kind: d.nav.staffPortal,
    },
    {
      name: d.public.demoOrgName2,
      kind: d.nav.hospitalPortal,
    },
  ];
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {orgs.map((org) => (
        <li key={org.name} className="rs-card flex items-start justify-between gap-4 px-5 py-4">
          <div>
            <p className="font-semibold text-ink">{org.name}</p>
            <p className="mt-0.5 text-sm text-ink-soft">{org.kind}</p>
          </div>
          <Badge tone="outline">{d.public.demoParticipantBadge}</Badge>
        </li>
      ))}
    </ul>
  );
}
