import { CATEGORY_LABELS } from "@/lib/content/companies";
import { formatDate } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-card";
import { getPublishedCompany } from "@/server/services/public-companies";

export const alt = "A company's hiring process and placement preparation";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const company = await getPublishedCompany((await params).slug);
  if (!company) return new Response("Not found", { status: 404 });
  const rounds = company.rounds.length;
  return ogImage({
    label: "Company prep",
    eyebrow: CATEGORY_LABELS[company.category],
    title: `${company.name} hiring process and syllabus`,
    detail: `${rounds} round${rounds === 1 ? "" : "s"} · ${company.questionCount} questions`,
    footer: { text: `Verified ${formatDate(company.lastVerifiedAt)}` },
  });
}
