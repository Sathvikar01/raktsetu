import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { APP_NAME, env } from "@/lib/env";
import { DemoBanner } from "@/components/site/DemoBanner";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: { default: "RaktSetu — follow your blood donation's journey", template: "%s · RaktSetu" },
  description:
    "Open-source, privacy-preserving transparency layer between blood banks, hospitals and blood donors. Follow the verified journey of your donation.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "RaktSetu",
    title: "RaktSetu — follow your blood donation's journey",
    description:
      "Open-source, privacy-preserving transparency layer between blood banks, hospitals and blood donors.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "RaktSetu — follow your blood donation's journey",
    description:
      "Open-source, privacy-preserving transparency layer between blood banks, hospitals and blood donors.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Single light theme color — the app has no dark theme yet, so a dark
  // entry would tint the browser chrome dark while the page stays light.
  themeColor: "#faf8f6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        {env.DEMO_MODE ? <DemoBanner demoMode /> : null}
        {children}
      </body>
    </html>
  );
}
