"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";

export interface NavLinkItem {
  href: string;
  label: string;
}

function linkClasses(active: boolean): string {
  return [
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    active ? "bg-teal-50 text-teal-700" : "text-ink-soft hover:bg-canvas hover:text-ink",
  ].join(" ");
}

export function DesktopNav({
  links,
  navAriaLabel,
  signInLabel,
  signUpLabel,
}: {
  links: NavLinkItem[];
  navAriaLabel: string;
  signInLabel: string;
  signUpLabel: string;
}) {
  const pathname = usePathname();
  return (
    <div className="hidden items-center gap-1 lg:flex">
      <nav aria-label={navAriaLabel}>
        <ul className="flex items-center gap-0.5">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={pathname === l.href ? "page" : undefined}
                className={linkClasses(pathname === l.href)}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <span aria-hidden className="mx-2 h-5 w-px bg-ink/15" />
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <LogIn className="size-4" aria-hidden />
        {signInLabel}
      </Link>
      <Link
        href="/register"
        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
      >
        <UserPlus className="size-4" aria-hidden />
        {signUpLabel}
      </Link>
    </div>
  );
}

export function MobileNav({
  links,
  navAriaLabel,
  menuLabel,
  signInLabel,
  signUpLabel,
}: {
  links: NavLinkItem[];
  navAriaLabel: string;
  menuLabel: string;
  signInLabel: string;
  signUpLabel: string;
}) {
  const pathname = usePathname();
  return (
    <details className="group relative lg:hidden">
      <summary
        aria-label={menuLabel}
        title={menuLabel}
        className="flex size-10 cursor-pointer list-none items-center justify-center rounded-lg text-ink transition-colors hover:bg-canvas [&::-webkit-details-marker]:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="size-5 group-open:hidden"
          aria-hidden
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="hidden size-5 group-open:block"
          aria-hidden
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </summary>
      <nav
        aria-label={navAriaLabel}
        className="absolute right-0 top-12 z-50 w-64 rounded-xl2 border border-ink/10 bg-white p-3 shadow-lift"
      >
        <ul className="space-y-0.5">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={pathname === l.href ? "page" : undefined}
                className={`${linkClasses(pathname === l.href)} block`}
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li aria-hidden className="my-2 h-px bg-ink/10" />
          <li>
            <Link href="/login" className={`${linkClasses(false)} flex items-center gap-2`}>
              <LogIn className="size-4" aria-hidden />
              {signInLabel}
            </Link>
          </li>
          <li>
            <Link href="/register" className={`${linkClasses(false)} flex items-center gap-2`}>
              <UserPlus className="size-4" aria-hidden />
              {signUpLabel}
            </Link>
          </li>
        </ul>
      </nav>
    </details>
  );
}
