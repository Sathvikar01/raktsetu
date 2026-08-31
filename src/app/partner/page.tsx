import type { Metadata } from "next";
import Link from "next/link";
import { Building2, QrCode, ShieldCheck, Zap } from "lucide-react";
import { Card, CardBody, SectionHeading, buttonClasses } from "@/packages/ui";

export const metadata: Metadata = {
  title: "Hospital & NGO Portal — RaktSetu",
  description: "Separate, secure entry for blood banks and hospitals to record donations and auto-generate donor link codes.",
};

export default function PartnerPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-teal-700 ring-1 ring-teal-600/15">
          <Building2 className="size-3.5" aria-hidden /> Hospital & NGO — separate front door
        </span>
        <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Record a donation. <span className="text-teal-700">Code generates itself.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-ink-soft">
          This portal is <strong className="font-semibold text-ink">only for verified blood banks and hospital staff</strong>. No donor data shown here.
          You record the collection — RaktSetu instantly creates the opaque link code + QR for the donor&apos;s slip. No manual invention, no patient data ever typed.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/partner/login" className={buttonClasses("primary", "md")}>
            Partner login
          </Link>
          <Link href="/partner/request" className={buttonClasses("secondary", "md")}>
            Request partner access
          </Link>
          <Link href="/about" className={buttonClasses("secondary", "md")}>
            How privacy works
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3">
        <Card>
          <CardBody>
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Zap className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-semibold text-ink">1. You record</h3>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              External donation ID, DIN (if any), date/time, facility. Hit <em>Record</em>. That&apos;s it — no donor name, phone, or email needed at this step.
            </p>
          </CardBody>
        </Card>
        <Card className="ring-1 ring-teal-600/20">
          <CardBody>
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-teal-600 text-white">
              <QrCode className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-semibold text-ink">2. Code auto-creates</h3>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Server generates a single-use opaque <code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">linkCode</code> instantly. Copy it or print the QR — hand the slip to the donor. Zero manual code invention.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-crimson-50 text-crimson-700">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-semibold text-ink">3. Donor follows privately</h3>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Donor enters the code once on this site → sees only their own verified journey. No patient data ever leaves the hospital.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="mx-auto mt-10 max-w-5xl">
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-widest text-ink-faint">Already verified?</h3>
              <p className="mt-1 text-sm text-ink-soft">
                Use your existing staff credentials. Donor accounts cannot open this portal.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href="/partner/login" className={buttonClasses("primary", "md")}>
                Go to partner login →
              </Link>
              <Link href="/partner/request" className={buttonClasses("secondary", "md")}>
                Request access →
              </Link>
            </div>
          </CardBody>
        </Card>
        <p className="mt-4 text-center text-xs text-ink-faint">
          This is a separate entry from the donor site — same theme, same privacy engine, isolated navigation.{" "}
          <Link href="/partners" className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            About partner programme
          </Link>
        </p>
      </div>
    </div>
  );
}
