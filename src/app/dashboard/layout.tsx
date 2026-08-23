import type { Metadata } from "next";
import Link from "next/link";
import { Droplets } from "lucide-react";
import { DemoBanner } from "@/components/site/DemoBanner";
import { getDictionary } from "@/i18n";
import { requireRole } from "@/lib/rbac";
import { signOutDonorAction } from "./actions";
import { DonorNav } from "./components/DonorNav";

export const metadata: Metadata = { title: "Donor app" };

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Deny-by-default: anonymous → /login, any non-DONOR role (incl.
  // PLATFORM_ADMIN) → /forbidden. Staff may not browse donor views.
  await requireRole("DONOR");
  const d = getDictionary();

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-teal-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        {d.common.skipToContent}
      </a>
      <DemoBanner demoMode={process.env.DEMO_MODE === "true"} />
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg font-bold tracking-tight text-ink"
            aria-label={d.common.brandHome}
          >
            <Droplets className="size-6 text-crimson-600" aria-hidden />
            <span className="text-lg">{d.common.appName}</span>
          </Link>
          <div className="flex items-center gap-3">
            <DonorNav />
            <form action={signOutDonorAction}>
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
