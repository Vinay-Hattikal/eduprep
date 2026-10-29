import { connection } from "next/server";
import { siteConfig } from "@/config/site";
import { MIN_INDEXABLE_TOPIC, questionUrl } from "@/lib/content/public-question";
import { publicQuestionSitemap } from "@/server/services/public-questions";

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const entry = (path: string, lastModified?: Date) =>
  `<url><loc>${escape(`${siteConfig.url}${path}`)}</loc>${
    lastModified ? `<lastmod>${lastModified.toISOString()}</lastmod>` : ""
  }</url>`;

/** One file of question URLs; the first file also lists the subject and topic pages. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/sitemaps/questions/[page]">,
) {
  await connection();
  const page = Number((await params).page);
  if (!Number.isInteger(page) || page < 0 || page > 1000)
    return new Response("Not found", { status: 404 });
  const { questions, subjects } = await publicQuestionSitemap(page);
  if (page > 0 && !questions.length) return new Response("Not found", { status: 404 });

  const urls = [
    ...subjects.flatMap((s) => [
      entry(`/questions/${s.slug}`),
      ...s.topics
        // Thin topics are "noindex" (D-058), so they stay out of the sitemap too.
        .filter((t) => t.questions >= MIN_INDEXABLE_TOPIC)
        .map((t) => entry(`/questions/${s.slug}/${t.slug}`)),
    ]),
    ...questions.map((q) => entry(questionUrl(q.externalId), q.updatedAt)),
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
