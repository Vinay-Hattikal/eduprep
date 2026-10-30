import { DIFFICULTY_LABELS } from "@/lib/content/workflow";
import { askedAt } from "@/lib/content/asked-at";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-card";
import { getPublicProblem } from "@/server/services/public-catalog";

export const alt = "A coding problem";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getPublicProblem((await params).slug);
  if (!data) return new Response("Not found", { status: 404 });
  const { problem, topics, companies } = data;
  return ogImage({
    label: "Coding problem",
    eyebrow: [...topics.slice(0, 2).map((t) => t.name), DIFFICULTY_LABELS[problem.difficulty]].join(
      " · ",
    ),
    title: problem.title,
    detail: "Solve it in the online judge",
    footer: { text: askedAt(companies.map((c) => c.company.name)) },
  });
}
