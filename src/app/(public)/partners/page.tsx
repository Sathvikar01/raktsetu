import type { Metadata } from "next";
import Link from "next/link";
import { Building2, HeartHandshake, Hospital, MessagesSquare } from "lucide-react";
import { getDictionary } from "@/i18n";
import { Badge, buttonClasses, Card, CardBody, SectionHeading } from "@/packages/ui";
import { DemoParticipantsPreview } from "@/components/site/CommunityStatsTeaser";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.ptTitle, description: d.public.ptIntro };
}

export default function PartnersPage() {
  const d = getDictionary();

  const audiences = [
    { icon: Building2, title: d.public.ptForBanksTitle, body: d.public.ptForBanksBody },
    { icon: Hospital, title: d.public.ptForHospitalsTitle, body: d.public.ptForHospitalsBody },
    { icon: HeartHandshake, title: d.public.ptForNgosTitle, body: d.public.ptForNgosBody },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <SectionHeading
        headingLevel="h1"
        kicker={d.public.ptKicker}
        title={d.public.ptTitle}
        body={d.public.ptIntro}
      />
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/partner/login" className={buttonClasses("primary", "md")}>
          {d.public.ptCtaLogin}
        </Link>
        <Link href="/partner/request" className={buttonClasses("secondary", "md")}>
          {d.public.ptCtaRequest}
        </Link>
      </div>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {audiences.map((a) => (
          <Card key={a.title}>
            <CardBody>
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <a.icon className="size-6" aria-hidden />
              </span>
              <h2 className="mt-4 font-semibold tracking-tight text-ink">{a.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{a.body}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <section aria-labelledby="demo-orgs-heading" className="mt-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="demo-orgs-heading" className="text-xl font-semibold tracking-tight text-ink">
            {d.public.ptDemoTitle}
          </h2>
          <Badge tone="amber">{d.public.demoNotice}</Badge>
        </div>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">{d.public.ptDemoBody}</p>
        <div className="mt-8">
          <DemoParticipantsPreview />
        </div>
      </section>

      <Card className="mt-16 bg-gradient-to-br from-teal-50 to-canvas">
        <CardBody className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-teal-700 shadow-card">
            <MessagesSquare className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold tracking-tight text-ink">{d.public.ptContactTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{d.public.ptContactBody}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/partner/request" className={buttonClasses("primary", "md")}>
              {d.public.ptCtaRequest}
            </Link>
            <Link href="/developers" className={buttonClasses("secondary", "md")}>
              {d.public.ptDevCta}
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
