import type { Metadata } from "next";
import Link from "next/link";
import { EyeOff, Fingerprint, Lock, Scale, Users } from "lucide-react";
import { getDictionary } from "@/i18n";
import { Card, CardBody, SectionHeading } from "@/packages/ui";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.pvTitle, description: d.public.pvIntro };
}

export default function PrivacyPage() {
  const d = getDictionary();

  const levels = [
    {
      name: d.privacy.levelNone,
      body: d.public.pvLevel0Body,
      icon: Lock,
    },
    {
      name: d.privacy.levelBroad,
      body: d.public.pvLevel1Body,
      icon: Users,
    },
    {
      name: d.privacy.levelLimited,
      body: d.public.pvLevel2Body,
      icon: Fingerprint,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <SectionHeading
        headingLevel="h1"
        kicker={d.public.pvKicker}
        title={d.public.pvTitle}
        body={d.public.pvIntro}
      />

      <section aria-labelledby="recipient-heading" className="mt-14">
        <h2 id="recipient-heading" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
          <EyeOff className="size-5 text-crimson-600" aria-hidden />
          {d.public.pvRecipientTitle}
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">{d.public.pvRecipientBody}</p>
      </section>

      <section aria-labelledby="levels-heading" className="mt-14">
        <h2 id="levels-heading" className="text-xl font-semibold tracking-tight text-ink">
          {d.public.pvLevelsTitle}
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">{d.public.pvLevelsIntro}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {levels.map((lvl, i) => (
            <Card key={lvl.name}>
              <CardBody>
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <lvl.icon className="size-5" aria-hidden />
                </span>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  0 / 1 / 2 · {["LEVEL 0", "LEVEL 1", "LEVEL 2"][i]}
                </p>
                <h3 className="mt-1 font-semibold text-ink">{lvl.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{lvl.body}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="kanon-heading" className="mt-14">
        <h2 id="kanon-heading" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
          <Scale className="size-5 text-teal-600" aria-hidden />
          {d.public.pvKAnonTitle}
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">{d.public.pvKAnonBody}</p>
      </section>

      <section aria-labelledby="dpdp-heading" className="mt-14">
        <h2 id="dpdp-heading" className="text-xl font-semibold tracking-tight text-ink">
          {d.public.pvDpdpTitle}
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">{d.public.pvDpdpBody}</p>
      </section>

      <section aria-labelledby="never-heading" className="mt-14">
        <Card className="border-crimson-600/15">
          <CardBody>
            <h2 id="never-heading" className="text-lg font-semibold tracking-tight text-crimson-700">
              {d.public.pvNeverTitle}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {d.public.pvNeverItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <EyeOff className="mt-0.5 size-4 shrink-0 text-crimson-500" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
