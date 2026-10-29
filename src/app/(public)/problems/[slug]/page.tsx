import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/shared/json-ld";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, Code2 } from "lucide-react";
import { ProblemStatement } from "@/components/coding/problem-statement";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { CODING_LANGUAGES, isCodingLanguage } from "@/lib/coding/languages";
import { DIFFICULTY_LABELS } from "@/lib/content/workflow";
import { plainExcerpt } from "@/lib/format";
import { getPublicProblem } from "@/server/services/public-catalog";

type Props = PageProps<"/problems/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getPublicProblem((await params).slug);
  if (!data) return { title: "Problem not found", robots: { index: false } };
  const { problem, companies } = data;
  const asked = companies.length
    ? ` Asked at ${companies.map((c) => c.company.name).join(", ")}.`
    : "";
  return {
    title: `${problem.title}: coding problem (${DIFFICULTY_LABELS[problem.difficulty]})`,
    description: `${plainExcerpt(problem.statement, 140)}${asked}`,
    alternates: { canonical: `/problems/${problem.slug}` },
  };
}

export default function PublicProblemPage(props: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <Suspense fallback={<PageSkeleton />}>
        <Problem {...props} />
      </Suspense>
    </main>
  );
}

async function Problem({ params }: Props) {
  const data = await getPublicProblem((await params).slug);
  if (!data) notFound();
  const { problem, topics, companies } = data;
  const solveHref = `/coding/${problem.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Coding problems",
        item: `${siteConfig.url}/problems`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: problem.title,
        item: `${siteConfig.url}/problems/${problem.slug}`,
      },
    ],
  };

  return (
    <article className="space-y-6">
      <JsonLd data={jsonLd} />
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/problems" className="hover:text-foreground">
          Coding problems
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span aria-current="page" className="truncate text-foreground">
          {problem.title}
        </span>
      </nav>
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{problem.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{DIFFICULTY_LABELS[problem.difficulty]}</Badge>
          {topics.map((t) => (
            <Link key={t.slug} href={`/problems?topic=${t.slug}`}>
              <Badge variant="outline">{t.name}</Badge>
            </Link>
          ))}
          <span className="text-sm text-muted-foreground">
            {problem.timeLimitMs / 1000} s · {problem.memoryLimitMb} MB
          </span>
        </div>
        {companies.length ? (
          <p className="text-sm text-muted-foreground">
            Asked at{" "}
            {companies.map((c, i) => (
              <span key={c.company.slug}>
                {i ? ", " : ""}
                <Link
                  href={`/companies/${c.company.slug}`}
                  className="text-primary hover:underline"
                >
                  {c.company.name}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </header>

      <ProblemStatement problem={problem} />

      <section className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
        <div className="flex-1 space-y-1">
          <p className="flex items-center gap-2 font-medium">
            <Code2 className="size-4 text-primary" aria-hidden="true" /> Solve it in the browser
          </p>
          <p className="text-sm text-muted-foreground">
            {problem.languages
              .map((l) => (isCodingLanguage(l) ? CODING_LANGUAGES[l].label : l))
              .join(", ")}
            . Your code runs against hidden test cases, with hints and an editorial.
          </p>
        </div>
        <Button asChild>
          <Link href={solveHref}>
            <Code2 /> Solve this problem
          </Link>
        </Button>
      </section>
    </article>
  );
}
