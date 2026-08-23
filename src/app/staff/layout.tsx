import type { Metadata } from "next";
import Link from "next/link";
import { Droplets } from "lucide-react";
import { getDictionary } from "@/i18n";
import { requireRole } from "@/lib/rbac";
import { Badge } from "@/packages/ui";
import { signOutStaffAction } from "./actions";
import { PortalTabs } from "./components/PortalTabs";

export const metadata: Metadata = { title: "Staff portal" };

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ORG_STAFF", "ORG_ADMIN", "PLATFORM_ADMIN");
  const d = getDictionary();
  const roleLabel =
    user.role === "PLATFORM_ADMIN"
      ? user.role
      : d.staff[user.role === "ORG_ADMIN" ? "roleAdmin" : "roleStaff"];

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-teal-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        {d.common.skipToContent}
      </a>
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/staff"
            className="flex items-center gap-2 rounded-lg font-bold tracking-tight text-ink"
            aria-label={d.common.brandHome}
          >
            <Droplets className="size-6 text-crimson-600" aria-hidden />
            <span className="text-lg">{d.common.appName}</span>
          </Link>
          <div className="flex items-center gap-3">
            <PortalTabs showAdmin={user.role === "ORG_ADMIN" || user.role === "PLATFORM_ADMIN"} showPlatform={user.role === "PLATFORM_ADMIN"} />
            <span className="hidden text-sm text-ink-soft sm:inline">
              {user.displayName}
              <Badge tone="teal" className="ml-2">
                {roleLabel}
              </Badge>
            </span>
            <form action={signOutStaffAction}>
              <button
                type="submit"
                className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-ink/30 hover:text-ink"
              >
                {d.common.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
