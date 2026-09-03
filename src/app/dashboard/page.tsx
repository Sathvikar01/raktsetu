import type { Metadata } from "next";
import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import {
  Badge,
  buttonClasses,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SectionHeading,
  StatTile,
  Stepper,
} from "@/packages/ui";
import { getDictionary, translate, DEFAULT_LOCALE } from "@/i18n";
import { deriveDonationProgress } from "@/packages/domain/derive";
import {
  DONATION_INTERVAL_DAYS,
  eligibilityWindow,
} from "@/packages/domain/eligibility";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/packages/database/client";
import { fmtDate } from "./format";
import {
  toComponentState,
  toDerivedEventView,
  EVENT_SELECT,
  type DerivedEventList,
} from "./progress";
import { LinkDonationForm } from "./components/LinkDonationForm";
import { Greeting } from "./components/Greeting";
import { LocalTemplate } from "./components/LocalTime";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.nav.dashboard };
}

const JOURNEY_KEYS = [
  "journeyCollected",
  "journeyProcessed",
  "journeyReady",
  "journeyPatientCare",
] as const;

/** Donor-facing countdown copy — soft guidance, never a clinical claim. */
function eligibilityBody(elig: ReturnType<typeof eligibilityWindow>): string {
  const days = DONATION_INTERVAL_DAYS.WHOLE_BLOOD;
  if (elig.eligible) return translate(DEFAULT_LOCALE, "donor.eligBodyEligible", { days });
  if (elig.daysRemaining === 1) {
    return translate(DEFAULT_LOCALE, "donor.eligBodyWaitTomorrow", { days });
  }
  return translate(DEFAULT_LOCALE, "donor.eligBodyWait", {
    days,
    date: fmtDate(elig.nextEligibleAt!),
    count: elig.daysRemaining,
  });
}

export default async function DashboardPage() {
  const user = await requireRole("DONOR");
  const d = getDictionary();

  const donations = user.donorProfileId
    ? await prisma.donation.findMany({
        where: { donorProfileId: user.donorProfileId },
        orderBy: { donatedAt: "desc" },
        select: { id: true, din: true, donatedAt: true },
      })
    : [];

  const donationIds = donations.map((x) => x.id);
  const [eventRows, componentRows, verifiedCareCount] = donationIds.length
    ? await Promise.all([
        prisma.lifecycleEvent.findMany({
          where: { donationId: { in: donationIds } },
          select: EVENT_SELECT,
        }),
        prisma.bloodComponent.findMany({
          where: { donationId: { in: donationIds } },
          select: { donationId: true, currentDerivedState: true },
        }),
        // Lifetime "reached patient care" counts only verified transfusion
        // events (fail-closed, PI-5) and ignores corrected history.
        prisma.lifecycleEvent.count({
          where: {
            donationId: { in: donationIds },
            eventType: "COMPONENT_TRANSFUSED",
            verificationStatus: "VERIFIED",
            supersededByCorrection: false,
          },
        }),
      ])
    : [[], [], 0];

  const eligibility = eligibilityWindow(new Date(), donations[0]?.donatedAt ?? null);

  const eventsByDonation = new Map<string, DerivedEventList>();
  for (const row of eventRows) {
    if (!row.donationId) continue;
    const list = eventsByDonation.get(row.donationId) ?? [];
    list.push(toDerivedEventView(row));
    eventsByDonation.set(row.donationId, list);
  }
  const componentsByDonation = new Map<string, Array<{ state: ReturnType<typeof toComponentState> }>>();
  for (const c of componentRows) {
    const list = componentsByDonation.get(c.donationId) ?? [];
    list.push({ state: toComponentState(c.currentDerivedState) });
    componentsByDonation.set(c.donationId, list);
  }

  return (
    <div className="space-y-8">
      <div>
        <Greeting displayName={user.displayName} />
        <p className="mt-1 text-sm text-ink-soft">{d.common.tagline}</p>
      </div>

      {donations.length > 0 ? (
        <section aria-labelledby="impact-heading" className="space-y-4">
          <div>
            <h2 id="impact-heading" className="text-xl font-semibold tracking-tight text-ink">
              {d.donor.impactTitle}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">{d.donor.impactIntro}</p>
          </div>

          <Card>
            <CardBody className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">
                  {eligibility.eligible ? d.donor.eligTitleEligible : d.donor.eligTitleWait}
                </p>
                <Badge tone={eligibility.eligible ? "teal" : "outline"}>
                  {eligibility.eligible
                    ? d.donor.eligBadgeReady
                    : translate(DEFAULT_LOCALE, "donor.eligDaysLeft", {
                        count: eligibility.daysRemaining,
                      })}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed text-ink-soft">{eligibilityBody(eligibility)}</p>
              <p className="text-xs text-ink-faint">{d.donor.eligNote}</p>
            </CardBody>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile value={donations.length} label={d.donor.impactDonations} />
            <StatTile value={componentRows.length} label={d.donor.impactComponents} />
            <StatTile value={verifiedCareCount} label={d.donor.impactVerifiedCare} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="donations-heading" className="space-y-4">
        <h2 id="donations-heading" className="text-xl font-semibold tracking-tight text-ink">
          {d.donor.donationsTitle}
        </h2>

        {donations.length === 0 ? (
          <EmptyState
            icon={HeartHandshake}
            title={d.donor.noDonations}
            action={
              <Link href="/how-it-works" className={buttonClasses("secondary", "sm")}>
                {d.donor.demoLink}
              </Link>
            }
          />
        ) : (
          <ul className="space-y-4">
            {donations.map((donation) => {
              const progress = deriveDonationProgress(
                eventsByDonation.get(donation.id) ?? [],
                componentsByDonation.get(donation.id) ?? []
              );
              const doneCount =
                Number(progress.collected) +
                Number(progress.processingCompleted) +
                Number(progress.componentsReady) +
                Number(progress.patientCareReached);
              const stageLabel =
                doneCount === 4 ? d.donor.usedInCare : d.donor[JOURNEY_KEYS[doneCount]];

              return (
                <li key={donation.id}>
                  <Card>
                    <CardBody className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-ink">
                          <LocalTemplate
                            template={translate(DEFAULT_LOCALE, "donor.donatedOn", {
                              date: "{DATE}",
                            })}
                            date={donation.donatedAt}
                          />
                        </p>
                        <Badge tone={progress.patientCareReached ? "teal" : "outline"}>
                          {stageLabel}
                        </Badge>
                      </div>
                      {donation.din ? (
                        <p className="text-sm text-ink-soft">
                          <span className="font-medium text-ink">{d.donor.dinLabel}</span>{" "}
                          <span className="font-mono">{donation.din}</span>
                        </p>
                      ) : null}
                      <Stepper
                        steps={JOURNEY_KEYS.map((key) => ({ label: d.donor[key] }))}
                        current={doneCount}
                        ariaLabel={d.donor.journeyStepperAria}
                      />
                      <Link
                        href={`/dashboard/donations/${donation.id}`}
                        className={buttonClasses("secondary", "sm")}
                      >
                        {d.common.viewJourney}
                      </Link>
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink">{d.donor.linkTitle}</h2>
          <p className="mt-1 text-sm text-ink-soft">{d.donor.linkBody}</p>
        </CardHeader>
        <CardBody>
          <div className="max-w-md">
            <LinkDonationForm />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
