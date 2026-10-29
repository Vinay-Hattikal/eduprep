import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/shared/json-ld";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, Clock, ListChecks, Play } from "lucide-react";
import { Markdown } from "@/components/shared/markdown";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { mockSummary, PLATFORM_LABELS, TEST_KIND_LABELS } from "@/lib/content/public-catalog";
import { getPublicMock } from "@/server/services/public-catalog";

type Props = PageProps<"/mock-tests/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const test = await getPublicMock((await params).slug);
  if (!test) return { title: "Mock test not found", robots: { index: false } };
  const summary = mockSummary(test.sections);
  return {
    title: `${test.title}: pattern, sections and timing`,
    description: `${test.title}: ${summary.questions} questions in ${summary.sections} sections, ${summary.minutes} minutes${summary.negativeMarking ? ", with negative marking" : ""}. Take it online in the real exam format.`,
    alternates: { canonical: `/mock-tests/${test.slug}` },
  };
}

export default function MockTestPage(props: Props) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <Suspense fallback={<PageSkeleton />}>
        <Mock {...props} />
      </Suspense>
    </main>
  );
}

async function Mock({ params }: Props) {
  const test = await getPublicMock((await params).slug);
  if (!test) notFound();
  const summary = mockSummary(test.sections);
  const startHref = `/tests/${test.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Mock tests",
        item: `${siteConfig.url}/mock-tests`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: test.title,
        item: `${siteConfig.url}/mock-tests/${test.slug}`,
      },
    ],
  };

  return (
    <article className="space-y-8">
      <JsonLd data={jsonLd} />
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/mock-tests" className="hover:text-foreground">
          Mock tests
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span aria-current="page" className="truncate text-foreground">
          {test.title}
        </span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{TEST_KIND_LABELS[test.kind]}</Badge>
          <Badge variant="outline">{PLATFORM_LABELS[test.platformStyle]}</Badge>
          {test.company ? (
            <Link href={`/companies/${test.company.slug}`}>
              <Badge variant="outline">{test.company.name}</Badge>
            </Link>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{test.title}</h1>
        {test.description ? <p className="text-muted-foreground">{test.description}</p> : null}
        <Button asChild size="lg">
          <Link href={startHref}>
            <Play /> Take this mock test
          </Link>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Questions" value={summary.questions} />
        <StatCard label="Sections" value={summary.sections} />
        <StatCard label="Minutes" value={summary.minutes} />
        <StatCard label="Marks" value={summary.marks} />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Sections</h2>
        <ol className="space-y-3">
          {test.sections.map((s, i) => (
            <li key={`${s.name}-${i}`} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">
                  {i + 1}. {s.name}
                </span>
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <ListChecks className="size-4" aria-hidden="true" /> {s.questions}{" "}
                  {s.type === "CODING" ? "problem" : "question"}
                  {s.questions === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="size-4" aria-hidden="true" /> {s.minutes} min
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {s.marksPerItem} mark{s.marksPerItem === 1 ? "" : "s"} each
                {s.negativeMarks
                  ? ` · −${s.negativeMarks} for a wrong answer`
                  : " · no negative marking"}
                {s.canGoBack ? "" : " · you can't go back to earlier questions"}
              </p>
              {s.topics.length ? (
                <p className="mt-2 text-xs text-muted-foreground">Topics: {s.topics.join(", ")}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {test.instructions ? (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Instructions</h2>
          <Markdown className="text-base">{test.instructions}</Markdown>
        </section>
      ) : null}
    </article>
  );
}
