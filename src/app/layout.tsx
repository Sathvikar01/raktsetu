import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/env";

export const metadata: Metadata = {
  title: { default: "RaktSetu — follow your blood donation's journey", template: "%s · RaktSetu" },
  description:
    "Open-source, privacy-preserving transparency layer between blood banks, hospitals and blood donors. Follow the verified journey of your donation.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf8f6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
