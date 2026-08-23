import type { Metadata } from "next";
import Link from "next/link";
import { FileCode2, GitPullRequest, HeartHandshake, Server } from "lucide-react";
import { getDictionary } from "@/i18n";
import { buttonClasses, Card, CardBody, SectionHeading } from "@/packages/ui";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.osTitle, description: d.public.osIntro };
}

export default function OpenSourcePage() {
  const d = getDictionary();

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <SectionHeading
        headingLevel="h1"
        kicker={d.public.osKicker}
        title={d.public.osTitle}
        body={d.public.osIntro}
      />

      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <Card>
          <CardBody>
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <FileCode2 className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink">
              {d.public.osApacheTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{d.public.osApacheBody}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <Server className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink">
              {d.public.osSelfHostTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{d.public.osSelfHostBody}</p>
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="contrib-heading" className="mt-10">
        <Card>
          <CardBody className="flex items-start gap-4">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-crimson-50 text-crimson-600">
              <GitPullRequest className="size-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="contrib-heading" className="text-lg font-semibold tracking-tight text-ink">
                {d.public.osContributeTitle}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{d.public.osContributeBody}</p>
              <ul className="mt-3 space-y-1 font-mono text-[13px] text-teal-700">
                <li>CONTRIBUTING.md</li>
                <li>docs/architecture.md</li>
                <li>docs/acceptance-tests.md</li>
                <li>docs/privacy-invariants.md</li>
              </ul>
            </div>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="pledge-heading" className="mt-10">
        <Card className="border-crimson-600/15 bg-gradient-to-br from-white to-crimson-50/40">
          <CardBody className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-crimson-600 shadow-card">
              <HeartHandshake className="size-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="pledge-heading" className="font-semibold tracking-tight text-ink">
                {d.public.osPledgeTitle}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{d.public.osPledgeBody}</p>
            </div>
          </CardBody>
        </Card>
      </section>

      <div className="mt-12 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/developers" className={buttonClasses("primary", "md")}>
          {d.nav.developers}
        </Link>
        <Link href="/community-impact" className={buttonClasses("secondary", "md")}>
          {d.nav.communityImpact}
        </Link>
      </div>
    </div>
  );
}
