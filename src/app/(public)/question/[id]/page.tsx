import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { PublicQuestionCard } from "@/components/content/public-question-card";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { questionTitle, questionUrl } from "@/lib/content/public-question";
import { getPublicQuestion } from "@/server/services/public-questions";

type Props = PageProps<"/question/[id]">;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getPublicQuestion((await params).id);
  if (!data) return { title: "Question not found", robots: { index: false } };
  const { question, topic, companies } = data;
  const title = questionTitle(question.text);
  const asked = companies.length
    ? ` Asked at ${companies.map((c) => c.company.name).join(", ")}.`
    : "";
  return {
    title: `${title} | ${topic.name} question`,
    description: `${topic.name} placement question${question.answer ? " with a worked answer" : ""}.${asked}`,
    alternates: { canonical: questionUrl(question.externalId) },
  };
}

export default function QuestionPage(props: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <Suspense fallback={<PageSkeleton />}>
        <Question {...props} />
      </Suspense>
    </main>
  );
}

async function Question({ params }: Props) {
  const data = await getPublicQuestion((await params).id);
  if (!data) notFound();
  const { question, topic, subject, companies, related } = data;
  const topicHref = `/questions/${subject.slug}/${topic.slug}`;
  const practiceHref = `/practice/session?topic=${topic.slug}`;

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
            name: subject.name,
            item: `${siteConfig.url}/questions/${subject.slug}`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: topic.name,
            item: `${siteConfig.url}${topicHref}`,
          },
        ],
      },
      ...(question.answer
        ? [
            {
              "@type": "Quiz",
              name: `${topic.name} question ${question.externalId}`,
              about: { "@type": "Thing", name: topic.name },
              hasPart: [
                {
                  "@type": "Question",
                  name: questionTitle(question.text),
                  eduQuestionType: "Multiple choice",
                  acceptedAnswer: { "@type": "Answer", text: question.answer.explanation },
                },
              ],
            },
          ]
        : []),
    ],
  };

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
      >
        <Link prefetch={false} href="/questions" className="hover:text-foreground">
          Questions
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <Link
          prefetch={false}
          href={`/questions/${subject.slug}`}
          className="hover:text-foreground"
        >
          {subject.name}
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <Link prefetch={false} href={topicHref} className="hover:text-foreground">
          {topic.name}
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {questionTitle(question.text, 110)}
      </h1>

      <PublicQuestionCard question={question} practiceHref={practiceHref} headingLevel="h2" />

      {companies.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Asked at</h2>
          <ul className="flex flex-wrap gap-2">
            {companies.map((c) => (
              <li key={c.company.slug}>
                <Link prefetch={false} href={`/companies/${c.company.slug}`}>
                  <Badge variant="secondary" className="hover:bg-secondary/70">
                    {c.company.name}
                    {c.askedIn.length ? ` · ${monthLabel(c.askedIn[0]!)}` : ""}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {related.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>More {topic.name} questions</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {related.map((r) => (
                <li key={r.externalId} className="py-2.5 first:pt-0 last:pb-0">
                  <Link
                    prefetch={false}
                    href={questionUrl(r.externalId)}
                    className="text-sm hover:text-primary"
                  >
                    {questionTitle(r.text, 100)}
                  </Link>
                  {r.publicSample ? (
                    <span className="ml-2 text-xs text-success">with answer</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <Link
              prefetch={false}
              href={topicHref}
              className="mt-4 inline-block text-sm font-medium text-primary"
            >
              All {topic.name} questions →
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
