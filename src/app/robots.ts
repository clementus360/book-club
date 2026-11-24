import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

/** Only the public pages are for search engines. Everything else is private or a one-off link. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/onboarding", "/invite", "/auth", "/email", "/calendar", "/api", "/reset-password", "/forgot-password"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
