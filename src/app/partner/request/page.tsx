import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { getDictionary } from "@/i18n";
import { Card, CardBody, CardHeader, SectionHeading } from "@/packages/ui";
import { buttonClasses } from "@/packages/ui";
import { RequestForm } from "./RequestForm";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return {
    title: d.public.partnerRequest.metaTitle,
    description: d.public.partnerRequest.metaDescription,
  };
}

export default function PartnerRequestPage() {
  const d = getDictionary();
  const t = d.public.partnerRequest;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8">
        <Link
          href="/partners"
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink"
        >
          <ArrowRight className="size-3.5 rotate-180" aria-hidden />
          {d.public.ptTitle}
        </Link>
      </div>

      <SectionHeading
        headingLevel="h1"
        kicker={t.kicker}
        title={t.title}
        body={t.intro}
      />

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <Building2 className="size-4 text-teal-600" aria-hidden />
              {t.formTitle}
            </h2>
          </CardHeader>
          <CardBody>
            <RequestForm />
          </CardBody>
        </Card>

        <Card className="bg-teal-50/60">
          <CardBody className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-teal-700 shadow-sm">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-ink">Already have credentials?</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                If your organisation is already verified, sign in directly — no request needed.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/partner/login" className={buttonClasses("primary", "sm")}>
                  {d.public.ptCtaLogin}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
                <Link href="/partners" className={buttonClasses("secondary", "sm")}>
                  {d.public.ptDevCta}
                </Link>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
