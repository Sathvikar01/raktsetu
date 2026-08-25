import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, KeyRound, QrCode, ShieldCheck, Zap } from "lucide-react";
import { getDictionary } from "@/i18n";
import { Alert, Input, Label } from "@/packages/ui";
import { PasswordField } from "@/packages/ui";
import { SubmitButton } from "@/components/site/SubmitButton";
import { partnerLoginAction } from "./actions";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return {
    title: d.public.partnerLogin.metaTitle,
    description: d.public.partnerLogin.metaDescription,
  };
}

const ERROR_KEYS = {
  invalid: "errInvalid",
  rate_limited: "errRateLimited",
  disabled: "errDisabled",
  email_unverified: "errEmailUnverified",
} as const;

const DEMO_ACCOUNTS = [
  "bb-staff@demo.local",
  "hosp-staff@demo.local",
  "admin@demo.local",
] as const;

export default async function PartnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const d = getDictionary();
  const t = d.public.partnerLogin;
  const { error } = await searchParams;
  const errorMessage =
    error && error in ERROR_KEYS
      ? t[ERROR_KEYS[error as keyof typeof ERROR_KEYS]]
      : null;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-xl2 border border-ink/5 bg-white shadow-lift lg:grid-cols-[1.05fr_1fr]">
        {/* Brand / trust panel */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-teal-700 p-10 text-white lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/10 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-crimson-500/20 blur-3xl"
          />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest ring-1 ring-white/25">
              <Building2 className="size-3.5" aria-hidden />
              {t.badge}
            </span>
            <h2 className="mt-6 max-w-sm text-2xl font-bold leading-snug tracking-tight">
              {t.panelTitle}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80">{t.panelBody}</p>

            <ul className="mt-8 space-y-4">
              {[
                { icon: Zap, text: t.point1 },
                { icon: QrCode, text: t.point2 },
                { icon: ShieldCheck, text: t.point3 },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="pt-1 text-sm leading-6 text-white/90">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative mt-10 border-t border-white/15 pt-4 text-xs tracking-wide text-white/60">
            {t.trustLine}
          </p>
        </aside>

        {/* Form column */}
        <section className="p-6 sm:p-10">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
              <Building2 className="size-4" aria-hidden />
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-teal-700">
              {t.mobileBadge}
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-ink">{t.title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{t.subtitle}</p>

          {errorMessage ? (
            <div className="mt-6">
              <Alert type="error">{errorMessage}</Alert>
            </div>
          ) : null}

          <form action={partnerLoginAction} className="mt-6 space-y-5">
            <div>
              <Label htmlFor="email">{t.workEmail}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus={!!errorMessage}
                required
                error={error === "invalid"}
              />
            </div>
            <PasswordField
              name="password"
              label={t.password}
              autoComplete="current-password"
              required
              showLabel={t.showPassword}
              hideLabel={t.hidePassword}
            />
            <SubmitButton pendingLabel={t.submitting}>{t.submit}</SubmitButton>
          </form>

          <details className="group mt-6 rounded-lg border border-ink/10 bg-canvas px-4 py-3 open:pb-4">
            <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-ink marker:content-none [&::-webkit-details-marker]:hidden">
              <KeyRound className="size-4 text-teal-600" aria-hidden />
              {t.demoTitle}
              <ArrowRight
                aria-hidden
                className="ml-auto size-4 text-ink-faint transition-transform group-open:rotate-90"
              />
            </summary>
            <p className="mt-3 text-xs leading-5 text-ink-soft">{t.demoBody}</p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account}>
                  <code className="rounded-md border border-ink/10 bg-white px-2 py-0.5 font-mono text-xs text-ink">
                    {account}
                  </code>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">
              <code className="rounded-md border border-ink/10 bg-white px-2 py-0.5 font-mono text-xs text-ink">
                demo-pass-1234
              </code>
            </p>
          </details>

          <div className="mt-8 border-t border-ink/10 pt-5 text-sm">
            <p className="text-ink-soft">
              {t.donorHint}{" "}
              <Link
                href="/login"
                className="rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
              >
                {t.donorSignIn}
              </Link>
            </p>
            <p className="mt-2 text-ink-soft">
              {t.needAccess}{" "}
              <Link
                href="/partner/request"
                className="rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
              >
                {t.requestAccess}
                <ArrowRight aria-hidden className="ml-1 inline size-3.5 -translate-y-px" />
              </Link>
              <span className="mx-1.5 text-ink-faint">·</span>
              <Link
                href="/partners"
                className="rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
              >
                {t.aboutProgramme}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
