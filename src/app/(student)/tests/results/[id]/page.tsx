import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Minus,
  RotateCcw,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { ShareButton } from "@/components/engagement/share-button";
import { Markdown } from "@/components/shared/markdown";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { VerdictBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OPTION_LETTERS } from "@/lib/content/question-rules";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { standing } from "@/server/services/contests";
import { getSittingResult, type ResultItem } from "@/server/services/tests";

export const metadata: Metadata = { title: "Test result", robots: { index: false } };

const FILTERS = { all: "All", wrong: "Wrong", skipped: "Skipped", review: "Marked" } as const;
type Filter = keyof typeof FILTERS;

export default function ResultPage({ params, searchParams }: PageProps<"/tests/results/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/tests">
          <ArrowLeft /> Mock tests
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Result params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const minutes = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

function answered(item: ResultItem) {
  return item.kind === "mcq"
    ? item.selectedOptions.length > 0 || item.numericAnswer !== null
    : item.best !== null;
}

function matches(item: ResultItem, filter: Filter) {
  if (filter === "wrong") return answered(item) && !item.isCorrect;
  if (filter === "skipped") return !answered(item);
  if (filter === "review") return item.markedForReview;
  return true;
}

async function Result({
  params,
  searchParams,
}: {
  params: PageProps<"/tests/results/[id]">["params"];
  searchParams: PageProps<"/tests/results/[id]">["searchParams"];
}) {
  const user = await requirePermission("student.access");
  const { id } = await params;
  const result = await getSittingResult(user, id);
  if (!result) notFound();
  const show = (await searchParams).show;
  const filter: Filter = typeof show === "string" && show in FILTERS ? (show as Filter) : "all";
  const percent = result.maxScore
    ? Math.round((Math.max(0, result.score) / result.maxScore) * 100)
    : 0;
  const attempted = result.sections.reduce((n, s) => n + s.attempted, 0);
  const correct = result.sections.reduce((n, s) => n + s.correct, 0);
  const total = result.sections.reduce((n, s) => n + s.total, 0);
  const items = result.items.filter((i) => matches(i, filter));
  const contestStanding = result.contest ? await standing(result.contest.id, user.id) : null;
  const hidden = result.contest?.solutionsAt ? new Date(result.contest.solutionsAt) : null;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{result.title}</h1>
        {result.contest ? (
          <p className="text-sm">
            <Link
              href={`/contests/${result.contest.slug}`}
              className="text-primary hover:underline"
            >
              {result.contest.title}
            </Link>
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Submitted {formatDateTime(new Date(result.submittedAt))}
          {result.autoSubmitted ? " · submitted automatically when time ran out" : ""}
          {result.tabSwitches ? ` · left the window ${result.tabSwitches}×` : ""}
        </p>
      </div>

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="result-summary"
      >
        <StatCard
          label="Score"
          value={`${result.score}/${result.maxScore}`}
          hint={`${percent}%`}
          icon={Trophy}
        />
        <StatCard
          label="Accuracy"
          value={attempted ? `${Math.round((correct / attempted) * 100)}%` : "—"}
          hint={`${correct} right of ${attempted} attempted`}
          icon={Target}
        />
        <StatCard
          label="Attempted"
          value={`${attempted}/${total}`}
          hint={`${total - attempted} skipped`}
          icon={CheckCircle2}
        />
        {contestStanding ? (
          <StatCard
            label={contestStanding.final ? "All-India rank" : "Rank so far"}
            value={contestStanding.rank.toLocaleString("en-IN")}
            hint={`of ${contestStanding.total.toLocaleString("en-IN")} · ${contestStanding.percentile} percentile`}
            icon={Clock3}
          />
        ) : (
          <StatCard
            label="Percentile"
            value={result.percentile === null ? "—" : `${result.percentile}`}
            hint={
              result.percentile === null
                ? "Shown once more students take this test"
                : "Share of test-takers you beat"
            }
            icon={Clock3}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Sections</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {result.sections.map((s) => {
            const share = s.maxScore ? Math.max(0, s.score) / s.maxScore : 0;
            const timeShare = s.minutes ? Math.min(1, s.timeSec / (s.minutes * 60)) : 0;
            return (
              <div key={s.name} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">
                      {s.score}/{s.maxScore}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {s.correct} right · {s.attempted - s.correct} wrong ·{" "}
                      {s.total - s.attempted} skipped
                    </span>
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-primary/15"
                  role="img"
                  aria-label={`${Math.round(share * 100)}% of marks`}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Time used {minutes(s.timeSec)} of {s.minutes} min ({Math.round(timeShare * 100)}%)
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {result.weakTopics.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Practise next</h2>
            </CardTitle>
            <CardDescription>
              Topics where you got less than 60% right in this test.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {result.weakTopics.map((t) => (
                <li
                  key={t.slug}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {t.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      {t.correct}/{t.total} right
                    </span>
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/practice/session?topic=${t.slug}`}>Practise</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {hidden ? (
        <Card data-testid="solutions-hidden">
          <CardHeader>
            <CardTitle>
              <h2>Solutions open when results are final</h2>
            </CardTitle>
            <CardDescription>
              Others are still taking this test, so answers stay hidden until{" "}
              {formatDateTime(hidden)}. Your rank updates live on the{" "}
              <Link
                href={`/contests/${result.contest!.slug}`}
                className="text-primary hover:underline"
              >
                leaderboard
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Solutions</h2>
            <nav aria-label="Filter questions" className="flex flex-wrap gap-1">
              {(Object.keys(FILTERS) as Filter[]).map((f) => (
                <Button key={f} asChild size="sm" variant={filter === f ? "secondary" : "ghost"}>
                  <Link
                    href={f === "all" ? `/tests/results/${id}` : `/tests/results/${id}?show=${f}`}
                    aria-current={filter === f ? "page" : undefined}
                  >
                    {FILTERS[f]} ({result.items.filter((i) => matches(i, f)).length})
                  </Link>
                </Button>
              ))}
            </nav>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here.</p>
          ) : null}
          <ol className="space-y-4">
            {items.map((item) => (
              <ResultCard
                key={item.id}
                item={item}
                number={result.items.indexOf(item) + 1}
                section={result.sections[item.section]?.name ?? ""}
              />
            ))}
          </ol>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {result.contest ? (
          <Button asChild>
            <Link href={`/contests/${result.contest.slug}`}>
              <Trophy /> Leaderboard
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href={`/tests/${result.blueprintSlug}`}>
              <RotateCcw /> Take again
            </Link>
          </Button>
        )}
        {result.contest ? (
          contestStanding?.final ? (
            <ShareButton
              kind="CONTEST"
              refId={result.id}
              text={`I ranked ${contestStanding.rank.toLocaleString("en-IN")} of ${contestStanding.total.toLocaleString("en-IN")} in ${result.contest.title}!`}
              label="Share my rank"
              size="default"
            />
          ) : null
        ) : (
          <ShareButton
            kind="TEST_RESULT"
            refId={result.id}
            text={`I scored ${result.score}/${result.maxScore} in the ${result.title} mock test.`}
            label="Share score"
            size="default"
          />
        )}
        <Button asChild variant="outline">
          <Link href="/tests">All tests</Link>
        </Button>
      </div>
    </div>
  );
}

function Outcome({ item }: { item: ResultItem }) {
  if (!answered(item)) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Minus className="size-4" aria-hidden="true" /> Skipped
      </span>
    );
  }
  return item.isCorrect ? (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
      <CheckCircle2 className="size-4" aria-hidden="true" /> Correct
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-destructive">
      <XCircle className="size-4" aria-hidden="true" />{" "}
      {item.kind === "coding" ? "Partly solved" : "Wrong"}
    </span>
  );
}

function ResultCard({
  item,
  number,
  section,
}: {
  item: ResultItem;
  number: number;
  section: string;
}) {
  return (
    <li>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium">Q{number}</span>
            <span className="text-muted-foreground">{section}</span>
            {item.topic ? <Badge variant="secondary">{item.topic.name}</Badge> : null}
            <Outcome item={item} />
            <span
              className={cn(
                "ml-auto tabular-nums",
                item.marks < 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {item.marks > 0 ? "+" : ""}
              {item.marks} marks · {minutes(item.timeSec)}
              {item.kind === "mcq" ? ` (aim ${minutes(item.question.expectedTimeSec)})` : ""}
            </span>
          </div>

          {item.kind === "mcq" ? (
            <>
              {item.question.passage ? (
                <details className="rounded-lg border bg-surface p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    {item.question.passage.title}
                  </summary>
                  <Markdown className="mt-2 text-base">{item.question.passage.body}</Markdown>
                </details>
              ) : null}
              <Markdown>{item.question.text}</Markdown>
              {item.question.code ? (
                <Markdown>{`\`\`\`${item.question.codeLanguage ?? ""}\n${item.question.code}\n\`\`\``}</Markdown>
              ) : null}
              {item.question.type === "NUMERIC" ? (
                <p className="text-sm">
                  Your answer: <span className="font-medium">{item.numericAnswer ?? "—"}</span> ·
                  Correct:{" "}
                  <span className="font-medium text-success">
                    {item.question.numericAnswer}
                    {item.question.tolerance ? ` (±${item.question.tolerance})` : ""}
                  </span>
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {item.question.options.map((option, i) => {
                    const letter = OPTION_LETTERS[i]!;
                    const right = item.question.correctOptions.includes(letter);
                    const chosen = item.selectedOptions.includes(letter);
                    return (
                      <li
                        key={letter}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-2.5",
                          right && "border-success/40 bg-success/5",
                          chosen && !right && "border-destructive/40 bg-destructive/5",
                        )}
                      >
                        <span className="w-5 shrink-0 pt-0.5 font-semibold">{letter}</span>
                        <div className="min-w-0 flex-1">
                          <Markdown className="text-base">{option}</Markdown>
                        </div>
                        <span className="shrink-0 pt-0.5 text-xs">
                          {right ? <span className="text-success">Correct</span> : null}
                          {chosen ? (
                            <span
                              className={cn("ml-2", right ? "text-success" : "text-destructive")}
                            >
                              Your answer
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="rounded-lg bg-surface p-4">
                <p className="mb-1 text-sm font-semibold">Explanation</p>
                <Markdown className="text-base">{item.question.explanation}</Markdown>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-medium">{item.problem.title}</p>
              {item.best ? (
                <>
                  <VerdictBadge verdict={item.best.verdict} />
                  <span className="text-sm text-muted-foreground">
                    {item.best.testsPassed}/{item.best.testsTotal} tests
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">No submission</span>
              )}
              <Button asChild size="sm" variant="outline" className="ml-auto">
                <Link href={`/coding/${item.problem.slug}`}>Solve it again</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
