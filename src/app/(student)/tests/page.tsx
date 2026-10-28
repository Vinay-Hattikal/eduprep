import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  Building2,
  Clock3,
  ListChecks,
  Lock,
  PlayCircle,
  Timer,
  Trophy,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { featuredContest } from "@/server/services/contests";
import { KIND_LABELS, listHistory, listTests, type TestCard } from "@/server/services/tests";

export const metadata: Metadata = { title: "Mock tests" };

export default function TestsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Mock tests"
        description="Timed tests in the real format: sections, timers, negative marking and an exam-style screen."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Catalogue />
      </Suspense>
    </div>
  );
}

function TestTile({ test }: { test: TestCard }) {
  return (
    <Card className="flex flex-col" data-testid="test-card">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KIND_LABELS[test.kind]}</Badge>
          {test.company ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="size-3.5" aria-hidden="true" /> {test.company.name}
            </span>
          ) : null}
        </div>
        <CardTitle>
          <h3 className="text-base">{test.title}</h3>
        </CardTitle>
        {test.description ? <CardDescription>{test.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="mt-auto space-y-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-4" aria-hidden="true" /> {test.minutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            <ListChecks className="size-4" aria-hidden="true" /> {test.items} questions
          </span>
          <span>
            {test.sections.length} section{test.sections.length === 1 ? "" : "s"}
          </span>
        </div>
        {test.best ? (
          <p className="text-sm">
            Best score{" "}
            <span className="font-semibold tabular-nums">
              {test.best.score}/{test.best.maxScore}
            </span>{" "}
            <span className="text-muted-foreground">
              · taken {test.taken} time{test.taken === 1 ? "" : "s"}
            </span>
          </p>
        ) : null}
        {test.inProgressId ? (
          <Button asChild className="w-full">
            <Link href={`/exam/${test.inProgressId}`}>
              <PlayCircle /> Resume
            </Link>
          </Button>
        ) : test.locked ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden="true" /> Free mock used for this company
          </p>
        ) : (
          <Button asChild variant={test.taken ? "outline" : "default"} className="w-full">
            <Link href={`/tests/${test.slug}`}>
              {test.taken ? "Take again" : "Start"} <ArrowRight />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

async function Catalogue() {
  const user = await requirePermission("student.access");
  const [tests, history, contest] = await Promise.all([
    listTests(user),
    listHistory(user.id, 10),
    featuredContest(user.id),
  ]);
  const banner = contest ? (
    <Link
      href={`/contests/${contest.slug}`}
      className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 hover:bg-primary/10"
    >
      <Trophy className="size-5 shrink-0 text-highlight" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{contest.title}</span>
        <span className="block text-sm text-muted-foreground">
          {contest.phase === "live"
            ? "All-India mock: live now, ranked against every student"
            : `All-India mock: opens ${formatDateTime(contest.startsAt)}`}
        </span>
      </span>
      <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </Link>
  ) : null;
  if (!tests.length) {
    return (
      banner ?? (
        <EmptyState
          icon={Timer}
          title="No mock tests yet"
          description="Company mocks and topic tests are on their way."
        />
      )
    );
  }
  const groups = (["COMPANY_MOCK", "OA", "TOPIC"] as const)
    .map((kind) => ({ kind, tests: tests.filter((t) => t.kind === kind) }))
    .filter((g) => g.tests.length);

  return (
    <div className="space-y-8">
      {banner}
      {groups.map((group) => (
        <section key={group.kind} className="space-y-3">
          <h2 className="text-lg font-semibold">{KIND_LABELS[group.kind]}s</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.tests.map((test) => (
              <TestTile key={test.slug} test={test} />
            ))}
          </div>
        </section>
      ))}

      {history.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your recent tests</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {history.map((s) => (
              <li key={s.id}>
                <Link
                  href={s.status === "SUBMITTED" ? `/tests/results/${s.id}` : `/exam/${s.id}`}
                  className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-secondary/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.blueprint.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(s.submittedAt ?? s.startedAt)}
                    </p>
                  </div>
                  {s.status === "SUBMITTED" ? (
                    <span className="text-sm font-semibold tabular-nums">
                      {s.score}/{s.maxScore}
                    </span>
                  ) : (
                    <Badge variant="outline" className="border-info/30 bg-info/10 text-info">
                      In progress
                    </Badge>
                  )}
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
