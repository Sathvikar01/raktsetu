import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { Badge, Card, CardBody, EmptyState, SectionHeading } from "@/packages/ui";
import { getDictionary, DEFAULT_LOCALE } from "@/i18n";
import { getSessionUser } from "@/lib/auth/session";
import { discoverUpcomingCamps } from "@/lib/services/camps";
import { CampRegisterButton } from "./CampRegisterButton";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.camps.metaTitle, description: d.camps.metaDescription };
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function CampsPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string; city?: string }>;
}) {
  const d = getDictionary();
  const params = await searchParams;
  const user = await getSessionUser();

  const latitude = params.lat ? Number(params.lat) : null;
  const longitude = params.lng ? Number(params.lng) : null;
  const hasGeo =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;

  const camps = await discoverUpcomingCamps({
    latitude: hasGeo ? latitude : null,
    longitude: hasGeo ? longitude : null,
    city: params.city?.trim() || null,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{d.camps.heroKicker}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{d.camps.heroTitle}</h1>
        <p className="max-w-3xl text-base leading-relaxed text-ink-soft">{d.camps.heroBody}</p>
      </section>

      <Card>
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="camp-city" className="mb-1 block text-sm font-medium text-ink">
                {d.camps.filterCity}
              </label>
              <input
                id="camp-city"
                name="city"
                defaultValue={params.city ?? ""}
                placeholder={d.camps.filterCityPlaceholder}
                maxLength={80}
                className="block w-56 rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="camp-lat" className="mb-1 block text-sm font-medium text-ink">
                Latitude
              </label>
              <input
                id="camp-lat"
                name="lat"
                defaultValue={params.lat ?? ""}
                inputMode="decimal"
                className="block w-32 rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="camp-lng" className="mb-1 block text-sm font-medium text-ink">
                Longitude
              </label>
              <input
                id="camp-lng"
                name="lng"
                defaultValue={params.lng ?? ""}
                inputMode="decimal"
                className="block w-32 rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm"
              />
            </div>
            <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
              {d.camps.apply}
            </button>
          </form>
          {hasGeo ? <p className="mt-2 text-xs text-teal-700">{d.camps.locationSet}</p> : null}
        </CardBody>
      </Card>

      <SectionHeading title={`${camps.length} ${d.camps.navLabel.toLowerCase()}`} align="left" />

      {camps.length === 0 ? (
        <EmptyState title={d.camps.empty} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {camps.map((camp) => (
            <li key={camp.id}>
              <Card className="h-full">
                <CardBody className="flex h-full flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-ink">{camp.name}</h3>
                      <p className="text-sm text-ink-soft">
                        {d.camps.colOrganizer}: {camp.orgName}{" "}
                        <Badge tone="teal">{d.camps.verifiedBadge}</Badge>
                      </p>
                    </div>
                    {camp.approxDistanceKm !== null ? (
                      <Badge tone="outline">
                        <MapPin className="mr-1 inline size-3" aria-hidden />
                        {d.camps.distanceApprox.replace("{km}", String(camp.approxDistanceKm))}
                      </Badge>
                    ) : null}
                  </div>
                  {camp.description ? <p className="text-sm text-ink-soft">{camp.description}</p> : null}
                  <dl className="mt-auto space-y-1 text-sm text-ink-soft">
                    <div>
                      <dt className="inline font-medium">{d.camps.colWhen}: </dt>
                      <dd className="inline">{formatDate(camp.startsAt)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">{d.camps.colWhere}: </dt>
                      <dd className="inline">
                        {camp.venue}, {camp.city}
                        {camp.state ? `, ${camp.state}` : ""}
                      </dd>
                    </div>
                    <div className="text-xs text-ink-faint">
                      {d.camps.registeredCount.replace("{count}", String(camp.registrationCount))}
                    </div>
                  </dl>
                  <CampRegisterButton campId={camp.id} signedIn={user !== null} />
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-ink-faint">{d.camps.adminNote}</p>
    </div>
  );
}
