import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pagination } from "@/components/shared/pagination";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { DIFFICULTY_LABELS } from "@/lib/content/workflow";
import { cn } from "@/lib/utils";
import { listPublicProblems } from "@/server/services/public-catalog";

type Props = PageProps<"/problems">;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { topic, page } = await searchParams;
  const filtered = typeof topic === "string" || (typeof page === "string" && page !== "1");
  return {
    title: "Coding problems asked in placement tests",
    description:
      "Coding problems from campus placement online assessments, with statements and sample tests. Solve them in the browser in C, C++, Java, Python or JavaScript.",
    alternates: { canonical: "/problems" },
    // Filtered and later pages repeat the main list; keep them out of results, but follow links.
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default function ProblemsPage(props: Props) {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Coding problems
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Problems from placement online assessments. Read any problem free; sign up to solve it in
          the browser with real test cases.
        </p>
      </header>
      <Suspense fallback={<PageSkeleton />}>
        <Problems {...props} />
      </Suspense>
    </main>
  );
}

const DIFFICULTY_TONES = {
  EASY: "text-success",
  MEDIUM: "text-warning",
  HARD: "text-destructive",
} as const;

async function Problems({ searchParams }: Props) {
  const query = await searchParams;
  const topic = typeof query.topic === "string" ? query.topic.slice(0, 80) : undefined;
  const page = Math.min(200, Math.max(1, Number(query.page) || 1));
  const { problems, total, pageCount, topics } = await listPublicProblems(page, topic);

  return (
    <div className="space-y-6">
      {topics.length ? (
        <nav aria-label="Topics" className="flex flex-wrap gap-2">
          <Link
            href="/problems"
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              !topic ? "border-primary bg-primary/10 text-primary" : "hover:bg-secondary/50",
            )}
          >
            All
          </Link>
          {topics.map((t) => (
            <Link
              key={t.slug}
              href={`/problems?topic=${t.slug}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                topic === t.slug
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-secondary/50",
              )}
            >
              {t.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <p className="tabular text-sm text-muted-foreground">
        {total} problem{total === 1 ? "" : "s"}
      </p>
      {problems.length ? (
        <ul className="divide-y rounded-xl border">
          {problems.map((p) => (
            <li key={p.slug} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
              <Link href={`/problems/${p.slug}`} className="font-medium hover:text-primary">
                {p.title}
              </Link>
              <span className={cn("text-sm font-medium", DIFFICULTY_TONES[p.difficulty])}>
                {DIFFICULTY_LABELS[p.difficulty]}
              </span>
              <span className="flex flex-wrap gap-1">
                {p.topics.map((t) => (
                  <Badge key={t.slug} variant="outline">
                    {t.name}
                  </Badge>
                ))}
              </span>
              {p.companies.length ? (
                <span className="text-xs text-muted-foreground sm:ml-auto">
                  Asked at {p.companies.map((c) => c.company.name).join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No problems here yet.</p>
      )}
      <Pagination page={page} pageCount={pageCount} basePath="/problems" params={{ topic }} />
    </div>
  );
}
