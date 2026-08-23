import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Alert,
  Badge,
  COMPONENT_TONES,
  buttonClasses,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Stepper,
  Timeline,
} from "@/packages/ui";
import { DEFAULT_LOCALE, getDictionary, translate } from "@/i18n";
import {
  getComponentDonorView,
  getVerifiedDecisionForEvent,
  type ComponentDonorView,
  type TimelineEntry,
  type VerifiedDecisionView,
} from "@/lib/services/disclosure-view";
import { deriveDonationProgress } from "@/packages/domain/derive";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/packages/database/client";
import { fmtDate } from "../../format";
import { toComponentState, toDerivedEventView, EVENT_SELECT } from "../../progress";
import { ImpactBlock } from "./ImpactBlock";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.nav.donations };
}

const KNOWN_COMPONENT_TYPES = ["RBC", "PLASMA", "PLATELET", "WHOLE_BLOOD", "OTHER"] as const;

function componentTypeLabel(type: string): string {
  const safe = (KNOWN_COMPONENT_TYPES as readonly string[]).includes(type) ? type : "OTHER";
  return translate(DEFAULT_LOCALE, `components.${safe}`);
}

function stateLabel(state: string): string {
  const key = `donor.state.${state}`;
  const rendered = translate(DEFAULT_LOCALE, key);
  return rendered === key ? state : rendered;
}

interface ComponentCardData {
  id: string;
  view: ComponentDonorView | null;
  decision: VerifiedDecisionView | null;
}

function timelineItems(entries: TimelineEntry[]) {
  return entries.map((entry) => ({
    title: translate(DEFAULT_LOCALE, entry.labelKey),
    date: fmtDate(entry.date),
    body: entry.facilityCityTier
      ? translate(DEFAULT_LOCALE, "donor.eventFacilityCity", { city: entry.facilityCityTier })
      : undefined,
  }));
}

const JOURNEY_KEYS = [
  "journeyCollected",
  "journeyProcessed",
  "journeyReady",
  "journeyPatientCare",
] as const;

export default async function DonationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("DONOR");
  const d = getDictionary();
  const { id } = await params;

  // Ownership gate (PI-9): the donation must belong to the session's donor profile.
  const donation = await prisma.donation.findUnique({
    where: { id },
    select: {
      id: true,
      din: true,
      donatedAt: true,
      donorProfileId: true,
      components: {
        orderBy: { createdAt: "asc" },
        select: { id: true, currentDerivedState: true },
      },
    },
  });
  if (!donation || !user.donorProfileId || donation.donorProfileId !== user.donorProfileId) {
    notFound();
  }

  const [profile, eventRows] = await Promise.all([
    prisma.donorProfile.findUnique({
      where: { id: user.donorProfileId },
      select: { bloodGroup: true },
    }),
    prisma.lifecycleEvent.findMany({
      where: { donationId: donation.id },
      select: EVENT_SELECT,
    }),
  ]);

  const progress = deriveDonationProgress(
    eventRows.map(toDerivedEventView),
    donation.components.map((c) => ({ state: toComponentState(c.currentDerivedState) }))
  );
  const doneCount =
    Number(progress.collected) +
    Number(progress.processingCompleted) +
    Number(progress.componentsReady) +
    Number(progress.patientCareReached);

  // All donor-visible rendering flows through disclosure-view outputs.
  // The transfusion-event lookup selects only an opaque internal id; the
  // decision itself is rendered by getVerifiedDecisionForEvent (fail-closed).
  const cards: ComponentCardData[] = await Promise.all(
    donation.components.map(async (component) => {
      const [view, transfusionEvent] = await Promise.all([
        getComponentDonorView(component.id, DEFAULT_LOCALE),
        prisma.lifecycleEvent.findFirst({
          where: {
            componentId: component.id,
            eventType: "COMPONENT_TRANSFUSED",
            verificationStatus: "VERIFIED",
            supersededByCorrection: false,
          },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          select: { id: true },
        }),
      ]);
      const decision = transfusionEvent
        ? await getVerifiedDecisionForEvent(transfusionEvent.id, DEFAULT_LOCALE)
        : null;
      return { id: component.id, view, decision };
    })
  );

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard"
        className={buttonClasses("ghost", "sm")}
      >
        {d.donor.backToDashboard}
      </Link>

      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            {donation.din ?? d.common.appName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
            <span>
              {translate(DEFAULT_LOCALE, "donor.donatedOn", { date: fmtDate(donation.donatedAt) })}
            </span>
            {profile?.bloodGroup ? (
              <span>
                <span className="font-medium text-ink">{d.donor.bloodGroupLabel}</span>{" "}
                {profile.bloodGroup}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardBody>
          <Stepper
            steps={JOURNEY_KEYS.map((key) => ({ label: d.donor[key] }))}
            current={doneCount}
            ariaLabel={d.donor.journeyStepperAria}
          />
        </CardBody>
      </Card>

      <section aria-labelledby="components-heading" className="space-y-4">
        <h2 id="components-heading" className="text-xl font-semibold tracking-tight text-ink">
          {d.donor.componentsTitle}
        </h2>
        <ul className="space-y-4">
          {cards.map(({ id: componentId, view, decision }) =>
            view ? (
              <li key={componentId} id={`component-${componentId}`}>
                <Card>
                  <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>{componentTypeLabel(view.componentType)}</CardTitle>
                    <Badge tone={COMPONENT_TONES[view.componentType] ?? "neutral"}>
                      {stateLabel(view.derivedState)}
                    </Badge>
                  </CardHeader>
                  <CardBody>
                    {view.preparedAt ? (
                      <p className="mb-4 text-sm text-ink-soft">
                        <span className="font-medium text-ink">{d.donor.componentCardPrepared}</span>{" "}
                        {fmtDate(view.preparedAt)}
                      </p>
                    ) : null}
                    {view.awaitingVerification ? (
                      <div className="mb-4">
                        <Alert type="info">
                          {translate(DEFAULT_LOCALE, "privacy.awaitingVerification")}
                        </Alert>
                      </div>
                    ) : null}
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
                      {d.donor.timelineTitle}
                    </h3>
                    {view.events.length > 0 ? (
                      <Timeline items={timelineItems(view.events)} />
                    ) : (
                      <p className="mt-2 text-sm text-ink-faint">{d.donor.timelineEmpty}</p>
                    )}
                    <ImpactBlock view={view} decision={decision} />
                  </CardBody>
                </Card>
              </li>
            ) : null
          )}
        </ul>
      </section>
    </div>
  );
}
