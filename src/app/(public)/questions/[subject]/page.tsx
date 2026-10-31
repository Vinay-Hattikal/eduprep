import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/shared/json-ld";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { siteConfig } from "@/config/site";
import { getPublicSubjects } from "@/server/services/public-questions";

async function findSubject(slug: string) {
  return (await getPublicSubjects()).find((s) => s.slug === slug) ?? null;
}

export async function generateMetadata({
  params,
}: PageProps<"/questions/[subject]">): Promise<Metadata> {
  const subject = await findSubject((await params).subject);
  if (!subject) return { title: "Subject not found", robots: { index: false } };
  return {
    title: `${subject.name} questions and answers for placements`,
    description: `${subject.questions} ${subject.name} questions across ${subject.topics.length} topics, as asked in campus placement tests, with worked sample answers.`,
    alternates: { canonical: `/questions/${subject.slug}` },
  };
}

export default function SubjectPage({ params }: PageProps<"/questions/[subject]">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <Suspense fallback={<PageSkeleton />}>
        <Subject params={params} />
      </Suspense>
    </main>
  );
}

async function Subject({ params }: { params: PageProps<"/questions/[subject]">["params"] }) {
  const subject = await findSubject((await params).subject);
  if (!subject) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Questions", item: `${siteConfig.url}/questions` },
      {
        "@type": "ListItem",
        position: 2,
        name: subject.name,
        item: `${siteConfig.url}/questions/${subject.slug}`,
      },
    ],
  };
  return (
    <div className="space-y-8">
      <JsonLd data={jsonLd} />
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/questions" className="hover:text-foreground">
          Questions
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span aria-current="page" className="text-foreground">
          {subject.name}
        </span>
      </nav>
      <header className="space-y-2">
        <h1 className="title-display">{subject.name} questions</h1>
        <p className="text-muted-foreground">
          {subject.questions} questions in {subject.topics.length} topics.
        </p>
      </header>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {subject.topics.map((topic) => (
          <li key={topic.id}>
            <Link
              href={`/questions/${subject.slug}/${topic.slug}`}
              className="flex items-center justify-between gap-3 rounded-xl border p-4 hover:bg-secondary/40"
            >
              <span className="font-medium">{topic.name}</span>
              <span className="tabular text-sm text-muted-foreground">
                {topic.questions} question{topic.questions === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
