import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/interviewer",
        "/dashboard",
        "/practice",
        "/tests",
        "/coding",
        "/interviews",
        "/progress",
        "/onboarding",
        "/dev-login",
        "/verify-email",
        "/reset-password",
        "/api",
        "/jobs/*/apply",
        "/contests",
        "/achievements",
        "/asked",
        "/s/",
      ],
    },
    // Question pages have their own sitemap index, split into files (D-058).
    sitemap: [`${siteConfig.url}/sitemap.xml`, `${siteConfig.url}/sitemaps/questions`],
  };
}
