import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Droplets } from "lucide-react";
import { getDictionary } from "@/i18n";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const d = getDictionary();
  const t = d.public.partnerShell;
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/partner" className="flex items-center gap-3 rounded-lg">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-teal-600 text-white">
              <Building2 className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-xs font-semibold uppercase tracking-widest text-teal-600">
                {t.portalBadge}
              </span>
              <span className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-ink">
                <Droplets className="size-4 text-crimson-600" aria-hidden />
                {d.common.appName}
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5 hover:text-ink sm:inline-flex"
            >
              {t.donorSiteLink}
            </Link>
            <Link
              href="/partner/login"
              className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              {t.loginCta}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-ink/10 bg-white py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-ink-faint sm:px-6">
          {t.footerLine}{" "}
          <Link href="/privacy" className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            {d.nav.privacy}
          </Link>
          {" · "}
          <Link href="/" className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            {t.donorSiteFooter}
          </Link>
        </div>
      </footer>
    </div>
  );
}
