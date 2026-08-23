import type { Metadata } from "next";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { getDictionary } from "@/i18n";
import { buttonClasses, Card, CardBody, SectionHeading } from "@/packages/ui";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.aboutTitle, description: d.public.aboutIntro };
}

export default function AboutPage() {
  const d = getDictionary();
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <SectionHeading
        headingLevel="h1"
        kicker={d.public.aboutKicker}
        title={d.public.aboutTitle}
        body={d.public.aboutIntro}
      />

      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-teal-700">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-teal-50">
                <Check className="size-4" aria-hidden />
              </span>
              {d.public.aboutIsTitle}
            </h2>
            <ul className="mt-4 space-y-3">
              {d.public.aboutIsItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <Check className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-crimson-700">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-crimson-50">
                <X className="size-4" aria-hidden />
              </span>
              {d.public.aboutNotTitle}
            </h2>
            <ul className="mt-4 space-y-3">
              {d.public.aboutNotItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <X className="mt-0.5 size-4 shrink-0 text-crimson-500" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="mt-12 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/open-source" className={buttonClasses("primary", "md")}>
          {d.public.contributionCtaOpenSource}
        </Link>
        <Link href="/how-it-works" className={buttonClasses("secondary", "md")}>
          {d.public.ctaHow}
        </Link>
      </div>
    </div>
  );
}
