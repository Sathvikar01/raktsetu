"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDictionary } from "@/i18n";

/** Portal tab nav with aria-current for the active route. */
export function PortalTabs({ showAdmin, showPlatform }: { showAdmin: boolean; showPlatform: boolean }) {
  const pathname = usePathname();
  const d = getDictionary();

  const tabs = [
    { href: "/staff", label: d.staff.portalTitle, visible: true },
    { href: "/admin", label: d.admin.portalTitle, visible: showAdmin },
    { href: "/admin/platform", label: d.admin.platformTitle, visible: showPlatform },
  ].filter((t) => t.visible);

  return (
    <nav aria-label={d.staff.chooseOrg}>
      <ul className="flex items-center gap-1">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-teal-50 text-teal-700" : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
