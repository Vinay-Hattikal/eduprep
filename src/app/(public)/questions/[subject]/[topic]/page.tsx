import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, Timer } from "lucide-react";
import { PublicQuestionCard } from "@/components/content/public-question-card";
import { Pagination } from "@/components/shared/pagination";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { PUBLIC_PAGE_SIZE, questionTitle, questionUrl } from "@/lib/content/public-question";
import { getPublicTopic } from "@/server/services/public-questions";

type Props = PageProps<"/questions/[subject]/[topic]">;

const pageOf = (value: string | string[] | undefined) =>
  Math.min(500, Math.max(1, Number(typeof value === "string" ? value : 1) || 1));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { subject, topic: topicSlug } = await params;
  const page = pageOf((await searchParams).page);
  const data = await getPublicTopic(subject, topicSlug, page);
  if (!data) return { title: "Topic not found", robots: { index: false } };
  const { topic, total } = data;
  const path = `/questions/${topic.subject.slug}/${topic.slug}${page > 1 ? `?page=${page}` : ""}`;
  return {
    title: `${topic.name} questions with answers (${topic.subject.name})${page > 1 ? `, page ${page}` : ""}`,
    description: `${total} ${topic.name} questions asked in placement tests, with worked answers to sample questions. Practise them free with a timer.`,
    alternates: { canonical: path },
    // Thin topics stay out of search results until they have enough questions (D-058).
    ...(data.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export default function TopicPage(props: Props) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <Suspense fallback={<PageSkeleton />}>
        <Topic {...props} />
      </Suspense>
    </main>
  );
}

async function Topic({ params, searchParams }: Props) {
  const { subject, topic: topicSlug } = await params;
  const page = pageOf((await searchParams).page);
  const data = await getPublicTopic(subject, topicSlug, page);
  if (!data) notFound();
  const { topic, total, samples, questions, companies } = data;
  const base = `/questions/${topic.subject.slug}/${topic.slug}`;
  const practiceHref = `/practice/session?topic=${topic.slug}`;
  const sampleQuestions = questions.filter((q) => q.answer);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Questions",
            item: `${siteConfig.url}/questions`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: topic.subject.name,
            item: `${siteConfig.url}/questions/${topic.subject.slug}`,
          },
          { "@type": "ListItem", position: 3, name: topic.name, item: `${siteConfig.url}${base}` },
        ],
      },
      ...(sampleQuestions.length
        ? [
            {
              "@type": "Quiz",
              name: `${topic.name} practice questions`,
              about: { "@type": "Thing", name: topic.name },
              educationalLevel: "Placement preparation",
              hasPart: sampleQuestions.map((q) => ({
                "@type": "Question",
                name: questionTitle(q.text),
                url: `${siteConfig.url}${questionUrl(q.externalId)}`,
                eduQuestionType: "Multiple choice",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: q.answer!.explanation,
                },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <div className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/questions" className="hover:text-foreground">
          Questions
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <Link href={`/questions/${topic.subject.slug}`} className="hover:text-foreground">
          {topic.subject.name}
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span aria-current="page" className="text-foreground">
          {topic.name}
        </span>
      </nav>

      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {topic.name} questions
        </h1>
        <p className="text-muted-foreground">
          {total} question{total === 1 ? "" : "s"} from placement tests
          {samples ? `, ${samples} with worked answers below` : ""}.
          {topic.subtopics.length
            ? ` Covers ${topic.subtopics.map((s) => s.name.toLowerCase()).join(", ")}.`
            : ""}
        </p>
        {companies.length ? (
          <p className="text-sm text-muted-foreground">
            Asked at{" "}
            {companies.map((c, i) => (
              <span key={c.slug}>
                {i ? ", " : ""}
                <Link href={`/companies/${c.slug}`} className="text-primary hover:underline">
                  {c.name}
                </Link>
              </span>
            ))}
            .
          </p>
        ) : null}
        <Button asChild>
          <Link href={practiceHref}>
            <Timer /> Practise all {total} with a timer
          </Link>
        </Button>
      </header>

      <ol className="space-y-4">
        {questions.map((q, i) => (
          <li key={q.externalId}>
            <PublicQuestionCard
              question={q}
              number={(page - 1) * PUBLIC_PAGE_SIZE + i + 1}
              titleHref={questionUrl(q.externalId)}
              practiceHref={practiceHref}
            />
          </li>
        ))}
      </ol>

      <Pagination page={page} pageCount={data.pageCount} basePath={base} params={{}} />
    </div>
  );
}
