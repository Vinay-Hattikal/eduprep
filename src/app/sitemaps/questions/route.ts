import { connection } from "next/server";
import { siteConfig } from "@/config/site";
import { publicQuestionSitemapPages } from "@/server/services/public-questions";

// Sitemap index for the public question pages (D-058). Google reads up to 50,000 URLs per
// file, so questions are split across /sitemaps/questions/0, /1, … Listed in robots.txt.
// Route handlers (not generateSitemaps) so builds never need the database.

export async function GET() {
  await connection();
  const pages = await publicQuestionSitemapPages();
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...Array.from(
      { length: pages },
      (_, i) => `<sitemap><loc>${siteConfig.url}/sitemaps/questions/${i}</loc></sitemap>`,
    ),
    "</sitemapindex>",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
