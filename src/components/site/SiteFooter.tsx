import Link from "next/link";
import { Droplets, ShieldCheck } from "lucide-react";
import { getDictionary } from "@/i18n";

export function SiteFooter() {
  const d = getDictionary();

  const columns: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
    {
      title: d.nav.footerExplore,
      links: [
        { href: "/", label: d.nav.home },
        { href: "/how-it-works", label: d.nav.howItWorks },
        { href: "/community-impact", label: d.nav.communityImpact },
        { href: "/about", label: d.nav.about },
      ],
    },
    {
      title: d.nav.footerProject,
      links: [
        { href: "/about", label: d.nav.about },
        { href: "/developers", label: d.nav.developers },
        { href: "/open-source", label: d.nav.openSource },
      ],
    },
    {
      title: d.nav.footerTrust,
      links: [
        { href: "/privacy", label: d.nav.privacy },
        { href: "/login", label: d.common.signIn },
        { href: "/register", label: d.common.signUp },
      ],
    },
  ];

  return (
    <footer className="mt-auto border-t border-ink/10 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 font-bold tracking-tight text-ink">
              <Droplets className="size-5 text-crimson-600" aria-hidden />
              {d.common.appName}
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">{d.common.tagline}</p>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {col.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={`${col.title}-${l.href}`}>
                    <Link
                      href={l.href}
                      className="rounded text-sm text-ink-soft transition-colors hover:text-teal-700"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-ink/10 pt-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>{d.nav.footerLicense}</p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-teal-600" aria-hidden />
            {d.nav.footerPledge}
          </p>
        </div>
        <p className="mt-4 text-xs text-ink-faint">{d.nav.footerMadeWith}</p>
      </div>
    </footer>
  );
}
