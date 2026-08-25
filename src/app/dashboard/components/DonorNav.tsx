"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDictionary } from "@/i18n";

const ITEMS = [
  { href: "/dashboard", navKey: "dashboard" },
  { href: "/dashboard/notifications", navKey: "notifications" },
  { href: "/dashboard/data", navKey: "yourData" },
  { href: "/dashboard/settings", navKey: "settings" },
] as const;

export function DonorNav() {
  const pathname = usePathname();
  const d = getDictionary();

  return (
    <nav aria-label={d.donor.navAria}>
      <ul className="flex items-center gap-1">
        {ITEMS.map(({ href, navKey }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard" || pathname.startsWith("/dashboard/donations")
              : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  active ? "bg-teal-50 text-teal-700" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                }`}
              >
                {d.nav[navKey]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
