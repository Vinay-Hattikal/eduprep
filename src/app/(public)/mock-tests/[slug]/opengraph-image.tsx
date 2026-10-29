import { mockSummary, TEST_KIND_LABELS } from "@/lib/content/public-catalog";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-card";
import { getPublicMock } from "@/server/services/public-catalog";

export const alt = "A placement mock test";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const test = await getPublicMock((await params).slug);
  if (!test) return new Response("Not found", { status: 404 });
  const summary = mockSummary(test.sections);
  return ogImage({
    label: "Mock test",
    eyebrow: test.company ? `${test.company.name} pattern` : TEST_KIND_LABELS[test.kind],
    title: test.title,
    detail: `${summary.questions} questions · ${summary.minutes} min`,
    footer: { text: summary.negativeMarking ? "Negative marking, like the real test" : undefined },
  });
}
