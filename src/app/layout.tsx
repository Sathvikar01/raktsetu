import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME, env } from "@/lib/env";
import { DemoBanner } from "@/components/site/DemoBanner";

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: { default: "RaktSetu — follow your blood donation's journey", template: "%s · RaktSetu" },
  description:
    "Open-source, privacy-preserving transparency layer between blood banks, hospitals and blood donors. Follow the verified journey of your donation.",
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf8f6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {env.DEMO_MODE ? <DemoBanner demoMode /> : null}
        {children}
      </body>
    </html>
  );
}
