import { env } from "@/lib/env";
import { getDictionary } from "@/i18n";
import { DemoBanner } from "@/components/site/DemoBanner";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const d = getDictionary();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-teal-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        {d.common.skipToContent}
      </a>
      <DemoBanner demoMode={env.DEMO_MODE} />
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter demoMode={env.DEMO_MODE} />
    </div>
  );
}
