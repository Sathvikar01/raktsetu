import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import {
  Alert,
  Badge,
  COMPONENT_TONES,
  buttonClasses,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
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
import { prisma } from "@/packages/database/client";
import { env } from "@/lib/env";

/**
 * Instant "View as demo donor" (DemoFlow): renders the real donor journey for
 * a DEMO-JOURNEY donation — no registration, no code entry. Hard-gated twice:
 * the deployment must run DEMO_MODE, and the link code must belong to a
 * demo-generated donation (`demo-` prefix), so genuine link codes can never be
 * viewed publicly even on demo deployments. All rendering flows through the
 * same disclosure-view services as the authenticated donor app.
 */

export const metadata: Metadata = { title: "RaktSetu demo donor view", robots: { index: false } };

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

function timelineItems(entries: TimelineEntry[]) {
  return entries.map((entry) => ({
    title: translate(DEFAULT_LOCALE, entry.labelKey),
    date: undefined,
    body: entry.facilityCityTier
      ? translate(DEFAULT_LOCALE, "donor.eventFacilityCity", { city: entry.facilityCityTier })
      : undefined,
    dateNode: (
      <span className="text-xs text-ink-faint">
        {entry.date.toISOString().slice(0, 10)}
      </span>
    ),
  }));
}

export default async function DemoDonorPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  if (!env.DEMO_MODE) notFound();
  const d = getDictionary();
  const { code } = await params;

  // Double gate: valid link code AND demo-generated donation only.
  const donation = await prisma.donation.findUnique({
    where: { linkCode: code },
    select: {
      id: true,
      din: true,
      externalDonationId: true,
      components: {
        orderBy: { createdAt: "asc" },
        select: { id: true, currentDerivedState: true },
      },
    },
  });
  if (!donation || !donation.externalDonationId.startsWith("demo-")) notFound();

  const cards: Array<{
    id: string;
    view: ComponentDonorView | null;
    decision: VerifiedDecisionView | null;
  }> = await Promise.all(
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
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-soft">
          <FlaskConical className="size-4" aria-hidden />
          {d.public.demoBadge}
        </div>
        <Link href="/how-it-works#demo" className={buttonClasses("ghost", "sm")}>
          {d.public.backToDemo}
        </Link>
      </div>

      <Alert type="info">{d.public.demoDonorNote}</Alert>

      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            {donation.din ?? d.common.appName}
          </h1>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-ink-soft">{d.donor.timelineTitle}</p>
        </CardBody>
      </Card>

      <section aria-labelledby="demo-components-heading" className="space-y-4">
        <h2 id="demo-components-heading" className="text-xl font-semibold tracking-tight text-ink">
          {d.donor.componentsTitle}
        </h2>
        <ul className="space-y-4">
          {cards.map(({ id: componentId, view, decision }) =>
            view ? (
              <li key={componentId}>
                <Card>
                  <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>{componentTypeLabel(view.componentType)}</CardTitle>
                    <Badge tone={COMPONENT_TONES[view.componentType] ?? "neutral"}>
                      {stateLabel(view.derivedState)}
                    </Badge>
                  </CardHeader>
                  <CardBody>
                    {view.awaitingVerification ? (
                      <div className="mb-4">
                        <Alert type="info">
                          {translate(DEFAULT_LOCALE, "privacy.awaitingVerification")}
                        </Alert>
                      </div>
                    ) : null}
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
                      {d.donor.timelineTitle}
                    </h3>
                    {view.events.length > 0 ? (
                      <Timeline items={timelineItems(view.events)} />
                    ) : (
                      <p className="mt-2 text-sm text-ink-faint">{d.donor.timelineEmpty}</p>
                    )}
                    {decision ? (
                      <div className="mt-4">
                        <p className="text-sm text-ink-soft">
                          {translate(DEFAULT_LOCALE, decision.messageKey)}
                        </p>
                      </div>
                    ) : null}
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
