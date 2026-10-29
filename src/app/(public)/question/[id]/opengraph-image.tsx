import { questionTitle } from "@/lib/content/public-question";
import { DIFFICULTY_LABELS } from "@/lib/content/workflow";
import { askedAt, OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-card";
import { getPublicQuestion } from "@/server/services/public-questions";

export const alt = "A placement practice question";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const data = await getPublicQuestion((await params).id);
  if (!data) return new Response("Not found", { status: 404 });
  const { question, topic, subject, companies } = data;
  return ogImage({
    label: "Practice question",
    eyebrow: `${subject.name} · ${topic.name} · ${DIFFICULTY_LABELS[question.difficulty]}`,
    title: questionTitle(question.text, 130),
    detail: question.answer ? "Worked answer inside" : undefined,
    footer: { text: askedAt(companies.map((c) => c.company.name)) },
  });
}
