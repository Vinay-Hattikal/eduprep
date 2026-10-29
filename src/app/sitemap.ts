import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteConfig } from "@/config/site";
import { openJobSlugs } from "@/server/services/job-postings";
import { getPublishedCompanies } from "@/server/services/public-companies";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Built per request (from cached data) so builds never need the database.
  await connection();
  const [companies, jobs] = await Promise.all([getPublishedCompanies(), openJobSlugs()]);
  return [
    { url: siteConfig.url, changeFrequency: "weekly", priority: 1 },
    { url: `${siteConfig.url}/companies`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteConfig.url}/questions`, changeFrequency: "daily", priority: 0.9 },
    ...companies.map((company) => ({
      url: `${siteConfig.url}/companies/${company.slug}`,
      lastModified: company.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    // Interview experiences, for companies that have approved ones.
    ...companies
      .filter((company) => company._count.experiences > 0)
      .map((company) => ({
        url: `${siteConfig.url}/companies/${company.slug}/experiences`,
        lastModified: company.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    { url: `${siteConfig.url}/pricing`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteConfig.url}/become-interviewer`, changeFrequency: "monthly", priority: 0.5 },
    ...["terms", "privacy", "refund-policy"].map((page) => ({
      url: `${siteConfig.url}/${page}`,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
    { url: `${siteConfig.url}/jobs`, changeFrequency: "daily", priority: 0.8 },
    ...jobs.map((job) => ({
      url: `${siteConfig.url}/jobs/${job.slug}`,
      lastModified: job.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
