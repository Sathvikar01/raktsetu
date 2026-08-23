import Link from "next/link";
import { Droplets } from "lucide-react";
import { getDictionary } from "@/i18n";
import { MobileNav, DesktopNav, type NavLinkItem } from "./NavLinks";

export function SiteHeader() {
  const d = getDictionary();
  const links: NavLinkItem[] = [
    { href: "/about", label: d.nav.about },
    { href: "/how-it-works", label: d.nav.howItWorks },
    { href: "/community-impact", label: d.nav.communityImpact },
    { href: "/privacy", label: d.nav.privacy },
    { href: "/partners", label: d.nav.partners },
    { href: "/developers", label: d.nav.developers },
    { href: "/open-source", label: d.nav.openSource },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg font-bold tracking-tight text-ink"
          aria-label={d.common.brandHome}
        >
          <Droplets className="size-6 text-crimson-600" aria-hidden />
          <span className="text-lg">{d.common.appName}</span>
        </Link>
        <DesktopNav
          links={links}
          navAriaLabel={d.nav.primaryNav}
          signInLabel={d.common.signIn}
          signUpLabel={d.common.signUp}
        />
        <MobileNav
          links={links}
          navAriaLabel={d.nav.primaryNav}
          menuLabel={d.common.menuOpen}
          signInLabel={d.common.signIn}
          signUpLabel={d.common.signUp}
        />
      </div>
    </header>
  );
}
