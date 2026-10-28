import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CircleAlert, PlayCircle, Trophy } from "lucide-react";
import { startContestAction } from "@/app/(student)/contests/actions";
import { Countdown } from "@/components/contests/countdown";
import { PhaseBadge } from "@/components/contests/phase-badge";
import { ShareButton } from "@/components/engagement/share-button";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { topShareLabel } from "@/lib/contests/ranking";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { getContest, leaderboard, standing } from "@/server/services/contests";

export const metadata: Metadata = { title: "All-India mock test" };

export default function ContestPage({ params, searchParams }: PageProps<"/contests/[slug]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/contests">
          <ArrowLeft /> All-India mocks
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Contest params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

async function Contest({ params, searchParams }: PageProps<"/contests/[slug]">) {
  const user = await requirePermission("student.access");
  const { slug } = await params;
  const { error } = await searchParams;
  const contest = await getContest(slug, user.id);
  if (!contest) notFound();
  const [board, mine] = await Promise.all([
    contest.phase === "upcoming" ? [] : leaderboard(contest.id, 50),
    standing(contest.id, user.id),
  ]);
  const meOnBoard = board.some((row) => row.userId === user.id);
  const top = mine ? topShareLabel(mine.rank, mine.total) : null;

  return (
    <div className="space-y-8">
      {contest.phase === "live" || contest.phase === "closing" ? (
        <AutoRefresh intervalMs={30_000} />
      ) : null}

      <div className="space-y-2">
        <PhaseBadge phase={contest.phase} />
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{contest.title}</h1>
        <p className="text-sm text-muted-foreground">
          Opens {formatDateTime(contest.startsAt)} · last start {formatDateTime(contest.endsAt)} ·{" "}
          {contest.durationMinutes} min · {contest.items} questions · final results{" "}
          {formatDateTime(contest.resultsAt)}
        </p>
        {contest.description ? <p className="max-w-2xl">{contest.description}</p> : null}
      </div>

      {typeof error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!contest.mine ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              {contest.phase === "upcoming" ? (
                <Countdown target={contest.startsAt.toISOString()} label="Opens in" />
              ) : contest.phase === "live" ? (
                <>
                  <p className="font-medium">One attempt. The timer starts when you begin.</p>
                  <Countdown target={contest.endsAt.toISOString()} label="Last start in" />
                </>
              ) : (
                <p className="text-muted-foreground">This test has closed.</p>
              )}
              <p className="text-sm text-muted-foreground">
                {contest.sections.map((s) => `${s.name} (${s.minutes} min)`).join(" · ")}
              </p>
            </div>
            {contest.phase === "live" ? (
              <form action={startContestAction}>
                <input type="hidden" name="slug" value={contest.slug} />
                <Button type="submit" size="lg" data-testid="start-contest">
                  <PlayCircle /> Start the test
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : contest.mine.status === "IN_PROGRESS" ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="font-medium">You&apos;ve started this test.</p>
            <Button asChild>
              <Link href={`/exam/${contest.mine.sittingId}`}>
                <PlayCircle /> Resume
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : mine ? (
        <section className="space-y-3" aria-label="Your result">
          <div className="grid gap-3 sm:grid-cols-3" data-testid="contest-standing">
            <StatCard
              label={mine.final ? "All-India rank" : "Rank so far"}
              value={`${mine.rank.toLocaleString("en-IN")}`}
              hint={`of ${mine.total.toLocaleString("en-IN")}${top ? ` · ${top}` : ""}`}
              icon={Trophy}
            />
            <StatCard
              label="Percentile"
              value={`${mine.percentile}`}
              hint={mine.final ? "Final" : "Changes as others finish"}
            />
            <StatCard
              label="Score"
              value={`${contest.mine.score}/${contest.mine.maxScore}`}
              hint="Ties go to the faster finisher"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/tests/results/${contest.mine.sittingId}`}>
                {mine.final ? "Review answers" : "Your sections"}
              </Link>
            </Button>
            {mine.final ? (
              <ShareButton
                kind="CONTEST"
                refId={contest.mine.sittingId}
                text={`I ranked ${mine.rank.toLocaleString("en-IN")} of ${mine.total.toLocaleString("en-IN")} (${mine.percentile} percentile) in ${contest.title}!`}
                label="Share my rank"
                variant="default"
                size="default"
              />
            ) : (
              <p className="self-center text-sm text-muted-foreground">
                Ranks are final and answers open at {formatDateTime(contest.resultsAt)}.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {contest.phase !== "upcoming" ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Leaderboard</h2>
            </CardTitle>
            <CardDescription>
              {contest.phase === "final"
                ? "Final ranks. Higher score first; equal scores go to the faster finisher."
                : "Live: updates as students finish. Higher score first, then less time."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {board.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="No finishers yet"
                description="Be the first on the board."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="leaderboard">
                  <caption className="sr-only">Leaderboard</caption>
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Rank</th>
                      <th className="py-2 pr-3 font-medium">Student</th>
                      <th className="py-2 pr-3 text-right font-medium">Score</th>
                      <th className="py-2 text-right font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {board.map((row) => (
                      <tr
                        key={row.sittingId}
                        className={cn(row.userId === user.id && "bg-primary/5 font-semibold")}
                      >
                        <td className="tabular py-2 pr-3">{row.rank}</td>
                        <td className="py-2 pr-3">
                          {row.name}
                          {row.userId === user.id ? " (you)" : ""}
                        </td>
                        <td className="tabular py-2 pr-3 text-right">
                          {row.score}/{row.maxScore}
                        </td>
                        <td className="tabular py-2 text-right">{clock(row.timeSec)}</td>
                      </tr>
                    ))}
                    {mine && !meOnBoard ? (
                      <tr className="bg-primary/5 font-semibold">
                        <td className="tabular py-2 pr-3">{mine.rank}</td>
                        <td className="py-2 pr-3" colSpan={3}>
                          You
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
