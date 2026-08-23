import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, FlaskConical, ShieldCheck, TerminalSquare } from "lucide-react";
import { getDictionary } from "@/i18n";
import { Alert, buttonClasses, Card, CardBody, SectionHeading, Timeline } from "@/packages/ui";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.hiwTitle, description: d.public.hiwIntro };
}

function CodeLine({ code }: { code: string }) {
  return (
    <code className="mt-1 block overflow-x-auto rounded-lg bg-ink px-4 py-2.5 text-sm text-teal-100">
      {code}
    </code>
  );
}

export default function HowItWorksPage() {
  const d = getDictionary();
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <SectionHeading
        headingLevel="h1"
        kicker={d.public.hiwKicker}
        title={d.public.hiwTitle}
        body={d.public.hiwIntro}
      />

      <section aria-labelledby="journey-heading" className="mt-14">
        <h2 id="journey-heading" className="text-xl font-semibold tracking-tight text-ink">
          {d.public.hiwJourneyTitle}
        </h2>
        <div className="mt-8">
          <Timeline items={d.public.hiwJourney} />
        </div>
      </section>

      <Card className="mt-14">
        <CardBody className="flex items-start gap-4">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-crimson-50 text-crimson-600">
            <ShieldCheck className="size-6" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">
              {d.public.hiwVerificationTitle}
            </h2>
            <p className="mt-2 leading-relaxed text-ink-soft">{d.public.hiwVerificationBody}</p>
            <Link
              href="/privacy"
              className="mt-3 inline-flex items-center gap-1.5 rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
            >
              {d.public.privacyReadMore}
            </Link>
          </div>
        </CardBody>
      </Card>

      {/* Demo section */}
      <section id="demo" aria-labelledby="demo-heading" className="scroll-mt-24 pt-16">
        <SectionHeading headingLevel="h2" kicker={d.public.demoKicker} title={d.public.demoTitle} body={d.public.demoIntro} />
        <Card className="mt-10">
          <CardBody className="space-y-5">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              <TerminalSquare className="size-5 text-teal-600" aria-hidden />
              shell
            </h3>
            <ol className="space-y-4">
              {d.public.demoSteps.map((step) => (
                <li key={step.code}>
                  <p className="text-sm font-medium text-ink">{step.caption}</p>
                  <CodeLine code={step.code} />
                </li>
              ))}
              <li>
                <p className="text-sm font-medium text-ink">{d.public.demoSimulateCaption}</p>
                <CodeLine code={d.public.demoSimulateCode} />
              </li>
            </ol>
            <Alert type="info" title={undefined}>
              <span className="flex items-start gap-2">
                <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
                {d.public.demoDemoDocNote}
              </span>
            </Alert>
            <Alert type="warn">
              <span className="flex items-start gap-2">
                <BookOpenCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                {d.public.demoDataNote}
              </span>
            </Alert>
          </CardBody>
        </Card>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/register" className={buttonClasses("primary", "md")}>
            {d.common.signUp}
          </Link>
          <Link href="/community-impact" className={buttonClasses("secondary", "md")}>
            {d.nav.communityImpact}
          </Link>
        </div>
      </section>
    </div>
  );
}
