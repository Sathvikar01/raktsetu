import Link from "next/link";
import { ArrowRight, BadgeCheck, Code2, GitBranch, HandHeart, ShieldCheck } from "lucide-react";
import { getDictionary } from "@/i18n";
import { buttonClasses } from "@/packages/ui";
import { Card, CardBody, CardHeader } from "@/packages/ui";
import { SectionHeading } from "@/packages/ui";
import { Stepper, Timeline } from "@/packages/ui";
import { CommunityStatsTeaser } from "@/components/site/CommunityStatsTeaser";

function flowSteps(): Array<{ label: string }> {
  const d = getDictionary();
  return [
    { label: d.public.flowYouDonate },
    { label: d.public.flowBloodBank },
    { label: d.public.flowComponents },
    { label: d.public.flowPatientCare },
    { label: d.public.flowYouKnow },
  ];
}

export const dynamic = "force-dynamic";

export default function LandingPage() {
  const d = getDictionary();
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-teal-50/80 to-transparent"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">
              {d.public.heroKicker}
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
              {d.public.heroTitle1}
              <br />
              <span className="text-teal-700">{d.public.heroTitle2}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">{d.public.heroBody}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/how-it-works#demo" className={buttonClasses("primary", "lg")}>
                {d.public.ctaDemo}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/how-it-works" className={buttonClasses("secondary", "lg")}>
                {d.public.ctaHow}
              </Link>
            </div>
          </div>
          <Card aria-hidden className="hidden lg:block">
            <CardBody className="space-y-6 py-8">
              <Stepper
                steps={flowSteps()}
                current={0}
                ariaLabel={d.public.heroFlowLabel}
              />
            </CardBody>
            <CardBody className="border-t border-ink/5 bg-canvas/50">
              <p className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-teal-600" />
                {d.public.privacyBody}
              </p>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Journey showcase — the product's core loop */}
      <section aria-labelledby="showcase-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionHeading
          headingLevel="h2"
          kicker={d.public.showcaseKicker}
          title={d.public.showcaseTitle}
          body={d.public.showcaseIntro}
        />
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
          <Card>
            <CardHeader>
              <p className="text-sm font-semibold text-ink">{d.public.showcaseJourneyLabel}</p>
            </CardHeader>
            <CardBody>
              <Timeline
                items={d.public.showcaseSteps.map((step) => ({ title: step }))}
              />
              <div className="mt-6 rounded-lg border border-teal-600/20 bg-teal-50/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                  {d.public.showcaseImpactTitle}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">
                  {d.public.showcaseImpactMessage}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                  {d.public.showcaseImpactProvenance}
                </p>
              </div>
            </CardBody>
          </Card>
          <div className="space-y-6">
            <h3 className="text-xl font-semibold tracking-tight text-ink">
              {d.public.showcaseWhyTitle}
            </h3>
            <p className="max-w-prose leading-relaxed text-ink-soft">{d.public.showcaseWhyBody}</p>
            <ul className="space-y-3">
              {d.public.showcasePoints.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
            <Link href="/how-it-works#demo" className={buttonClasses("primary", "md")}>
              {d.public.showcaseCta}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Flow strip */}
      <section aria-label={d.public.heroFlowLabel} className="border-y border-ink/5 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:hidden">
          <Stepper steps={flowSteps()} current={0} ariaLabel={d.public.heroFlowLabel} />
        </div>
      </section>

      {/* Privacy + verified claims */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardBody>
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <ShieldCheck className="size-6" aria-hidden />
              </span>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">
                {d.public.privacyTitle}
              </h2>
              <p className="mt-2 leading-relaxed text-ink-soft">{d.public.privacyBody}</p>
              <Link
                href="/privacy"
                className="mt-4 inline-flex items-center gap-1.5 rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
              >
                {d.public.privacyReadMore}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-crimson-50 text-crimson-600">
                <BadgeCheck className="size-6" aria-hidden />
              </span>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">
                {d.public.verifiedOnly}
              </h2>
              <p className="mt-2 leading-relaxed text-ink-soft">{d.public.verifiedBody}</p>
              <Link
                href="/how-it-works"
                className="mt-4 inline-flex items-center gap-1.5 rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
              >
                {d.public.verifiedReadMore}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Community stats teaser */}
      <section className="border-y border-ink/5 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:py-20">
          <SectionHeading title={d.public.statsTeaserTitle} body={d.public.statsTeaserIntro} />
          <div className="mt-10">
            <CommunityStatsTeaser />
          </div>
        </div>
      </section>

      {/* Open-source mission */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionHeading
          kicker={d.public.osKicker}
          title={d.public.missionTitle}
          body={d.public.missionBody}
        />
        <div className="mt-8 flex justify-center">
          <Link
            href="/open-source"
            className="inline-flex items-center gap-1.5 rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
          >
            {d.public.contributionCtaOpenSource}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Partners preview */}
      <section className="border-t border-ink/5 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <SectionHeading
            title={d.public.partnersPreviewTitle}
            body={d.public.partnersPreviewBody}
          />
          <p className="mt-6 text-center">
            <Link
              href="/partners"
              className={buttonClasses("primary", "sm")}
            >
              {d.public.partnersMeet}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </p>
        </div>
      </section>

      {/* Contribution CTA */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:py-20">
        <Card className="bg-gradient-to-br from-teal-50 to-canvas">
          <CardBody className="flex flex-col items-center gap-6 py-10 text-center sm:flex-row sm:text-left">
            <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-white text-teal-700 shadow-card">
              <GitBranch className="size-7" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                {d.public.contributionTitle}
              </h2>
              <p className="mt-1.5 leading-relaxed text-ink-soft">{d.public.contributionBody}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Link href="/open-source" className={buttonClasses("primary", "sm")}>
                <Code2 className="size-4" aria-hidden />
                {d.public.contributionCtaOpenSource}
              </Link>
              <Link href="/developers" className={buttonClasses("secondary", "sm")}>
                <HandHeart className="size-4" aria-hidden />
                {d.public.contributionCtaDevelopers}
              </Link>
            </div>
          </CardBody>
        </Card>
      </section>
    </>
  );
}
