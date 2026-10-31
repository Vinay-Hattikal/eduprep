import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, Circle, CircleDot, Code2, Search } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { DifficultyLabel } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { requirePermission } from "@/server/auth";
import {
  codingSummary,
  codingUsage,
  listProblems,
  listProblemTopics,
  PROBLEM_STATES,
  type ProblemFilter,
} from "@/server/services/coding";

export const metadata: Metadata = { title: "Coding" };

const STATE_LABELS = {
  all: "All problems",
  todo: "Not started",
  attempted: "Attempted",
  solved: "Solved",
};

export default function CodingPage({ searchParams }: PageProps<"/coding">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Coding"
        description="Interview and online-assessment problems with a real judge. Write in C, C++, Java, Python or JavaScript."
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <ProblemList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function ProblemList({
  searchParams,
}: {
  searchParams: PageProps<"/coding">["searchParams"];
}) {
  const user = await requirePermission("student.access");
  const params = await searchParams;
  const difficulty = one(params.difficulty);
  const state = one(params.state);
  const filter: ProblemFilter = {
    difficulty:
      difficulty === "EASY" || difficulty === "MEDIUM" || difficulty === "HARD"
        ? difficulty
        : undefined,
    topic: one(params.topic)?.slice(0, 80) || undefined,
    state: PROBLEM_STATES.includes(state as never) ? (state as ProblemFilter["state"]) : "all",
    q: one(params.q)?.slice(0, 80) || undefined,
  };
  const [problems, topics, summary, usage] = await Promise.all([
    listProblems(user, filter),
    listProblemTopics(user),
    codingSummary(user.id),
    codingUsage(user),
  ]);
  const filtered = Boolean(filter.difficulty || filter.topic || filter.q || filter.state !== "all");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Solved" value={summary.solved} icon={CheckCircle2} />
        <StatCard label="Attempted" value={summary.attempted} icon={CircleDot} />
        <StatCard
          label="Free plan"
          value={
            usage.limit === null
              ? "Unlimited"
              : `${Math.min(usage.used, usage.limit)}/${usage.limit}`
          }
          hint={usage.limit === null ? undefined : "problems started"}
          icon={Code2}
        />
      </div>

      <form className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter problems">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={filter.q}
            placeholder="Search problems"
            aria-label="Search problems"
            className="pl-8"
          />
        </div>
        <NativeSelect
          name="difficulty"
          defaultValue={filter.difficulty ?? ""}
          aria-label="Difficulty"
        >
          <NativeSelectOption value="">Any difficulty</NativeSelectOption>
          <NativeSelectOption value="EASY">Easy</NativeSelectOption>
          <NativeSelectOption value="MEDIUM">Medium</NativeSelectOption>
          <NativeSelectOption value="HARD">Hard</NativeSelectOption>
        </NativeSelect>
        <NativeSelect name="topic" defaultValue={filter.topic ?? ""} aria-label="Topic">
          <NativeSelectOption value="">All topics</NativeSelectOption>
          {topics.map((t) => (
            <NativeSelectOption key={t.slug} value={t.slug}>
              {t.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="state" defaultValue={filter.state} aria-label="Status">
          {PROBLEM_STATES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {STATE_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered ? (
          <Button asChild variant="ghost">
            <Link href="/coding">Clear</Link>
          </Button>
        ) : null}
      </form>

      {problems.length === 0 ? (
        <EmptyState
          icon={Code2}
          title={filtered ? "No problems match" : "No problems yet"}
          description={
            filtered ? "Try fewer filters." : "Coding problems are being added. Check back soon."
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card" data-testid="problem-list">
          {problems.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/coding/${p.slug}`}
                className="flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none"
              >
                {p.state === "solved" ? (
                  <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Solved" />
                ) : p.state === "attempted" ? (
                  <CircleDot className="size-5 shrink-0 text-warning" aria-label="Attempted" />
                ) : (
                  <Circle
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-label="Not started"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[...p.topics, ...p.companies.map((c) => `Asked at ${c}`)].join(" · ")}
                  </p>
                </div>
                {p.acceptance !== null ? (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {p.acceptance}% accepted
                  </span>
                ) : null}
                <DifficultyLabel difficulty={p.difficulty} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
