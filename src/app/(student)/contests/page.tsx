import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CalendarClock, Clock3, ListChecks, Trophy, Users } from "lucide-react";
import { Countdown } from "@/components/contests/countdown";
import { PhaseBadge } from "@/components/contests/phase-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { listContests, type ContestSummary } from "@/server/services/contests";

export const metadata: Metadata = { title: "All-India mock tests" };

export default function ContestsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="All-India mock tests"
        description="One test a week, the same questions for everyone, ranked live. Free for every student."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Contests />
      </Suspense>
    </div>
  );
}

function CurrentContest({ contest }: { contest: ContestSummary }) {
  return (
    <Card data-testid="contest-card">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <PhaseBadge phase={contest.phase} />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" aria-hidden="true" />{" "}
            {contest.participants.toLocaleString("en-IN")} finished
          </span>
        </div>
        <CardTitle>
          <h2 className="text-lg">{contest.title}</h2>
        </CardTitle>
        {contest.description ? <CardDescription>{contest.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-4" aria-hidden="true" />
            {formatDateTime(contest.startsAt)} – {formatDateTime(contest.endsAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-4" aria-hidden="true" /> {contest.durationMinutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            <ListChecks className="size-4" aria-hidden="true" /> {contest.items} questions
          </span>
        </div>
        {contest.phase === "upcoming" ? (
          <Countdown target={contest.startsAt.toISOString()} label="Opens in" />
        ) : contest.phase === "live" ? (
          <Countdown target={contest.endsAt.toISOString()} label="Last start in" />
        ) : null}
        <Button asChild>
          <Link href={`/contests/${contest.slug}`}>
            {contest.mine?.status === "SUBMITTED"
              ? "See your rank"
              : contest.mine
                ? "Resume"
                : contest.phase === "live"
                  ? "Take the test"
                  : "Details"}{" "}
            <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

async function Contests() {
  const user = await requirePermission("student.access");
  const { current, past } = await listContests(user.id);
  if (!current.length && !past.length) {
    return (
      <EmptyState
        icon={Trophy}
        title="The first All-India mock is coming"
        description="Every week, take the same test as students across India and see where you stand."
      />
    );
  }
  return (
    <div className="space-y-8">
      {current.length ? (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Live and upcoming">
          {current.map((contest) => (
            <CurrentContest key={contest.id} contest={contest} />
          ))}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          No test is open right now. The next one is announced on your dashboard.
        </p>
      )}

      {past.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Past tests</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {past.map((contest) => (
              <li key={contest.id}>
                <Link
                  href={`/contests/${contest.slug}`}
                  className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-secondary/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{contest.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(contest.startsAt)} ·{" "}
                      {contest.participants.toLocaleString("en-IN")} students
                    </p>
                  </div>
                  {contest.mine?.finalRank ? (
                    <span className="text-sm font-semibold tabular-nums">
                      Rank {contest.mine.finalRank.toLocaleString("en-IN")}
                    </span>
                  ) : contest.mine ? (
                    <PhaseBadge phase={contest.phase} />
                  ) : (
                    <span className="text-xs text-muted-foreground">Not taken</span>
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
