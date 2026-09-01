import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.APP_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/staff", "/admin", "/partner", "/demo", "/api", "/login", "/register", "/reset-password", "/forgot-password", "/verify-email", "/mfa"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
