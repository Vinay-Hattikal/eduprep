import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Flame,
  Medal,
  Megaphone,
  MessageSquareReply,
  Pencil,
  RotateCcw,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { Countdown } from "@/components/contests/countdown";
import { ReadinessRing } from "@/components/learning/readiness-ring";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import {
  getRecentActivity,
  getReportUpdates,
  getStudentStats,
  getTargetReadiness,
} from "@/server/services/learning";
import { featuredContest } from "@/server/services/contests";
import { listBadges } from "@/server/services/engagement";
import { dailyAnswer, getDailyQuestionId, practiceUsage } from "@/server/services/practice";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

function daysLeftLabel(daysLeft: number | null, date: Date | null) {
  if (daysLeft === null || !date) return null;
  if (daysLeft < 0) return `Was on ${formatDate(date)}`;
  if (daysLeft === 0) return "Today";
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`;
}

async function Dashboard({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard">["searchParams"];
}) {
  const user = await requirePermission("student.access");
  const query = await searchParams;
  const [targets, stats, recent, reports, usage, dailyId, contest, badges] = await Promise.all([
    getTargetReadiness(user.id),
    getStudentStats(user.id),
    getRecentActivity(user.id),
    getReportUpdates(user.id),
    practiceUsage(user),
    getDailyQuestionId(),
    featuredContest(user.id),
    listBadges(user.id),
  ]);
  const newBadges = badges.filter((b) => !b.seen);
  const daily = dailyId ? await dailyAnswer(user.id, dailyId) : null;
  const firstName = user.name.split(" ")[0];
  const focus = targets.flatMap((t) => t.focus.map((f) => ({ ...f, company: t.name })));
  const nextTopic = focus.sort((a, b) => a.mastery - b.mastery)[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title={query.welcome ? `Welcome, ${firstName}!` : `Hi, ${firstName}`}
        description={
          stats.practisedToday
            ? "Nice work today. Keep your streak going tomorrow."
            : "A few questions a day adds up. Start with your weakest topic."
        }
        actions={
          <>
            {user.profileType ? (
              <Badge variant="secondary">
                {user.profileType === "FRESHER" ? "Fresher track" : "Experienced track"}
              </Badge>
            ) : null}
            <Button asChild variant="ghost" size="sm">
              <Link href="/onboarding">
                <Pencil /> Edit goals
              </Link>
            </Button>
          </>
        }
      />

      {query.welcome ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>You&apos;re all set</AlertTitle>
          <AlertDescription>
            Your readiness updates as you practise. Try the question of the day to start your
            streak.
          </AlertDescription>
        </Alert>
      ) : null}
      {query.goals ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Goals updated</AlertTitle>
        </Alert>
      ) : null}

      {newBadges.length ? (
        <Alert data-testid="new-badges">
          <Medal />
          <AlertTitle>
            New badge{newBadges.length === 1 ? "" : "s"}: {newBadges.map((b) => b.name).join(", ")}
          </AlertTitle>
          <AlertDescription>
            <Link href="/achievements" className="text-primary hover:underline">
              See your achievements and share them
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {contest && !(contest.mine?.status === "SUBMITTED" && contest.phase !== "final") ? (
        <Card className="border-primary/30 bg-primary/5" data-testid="featured-contest">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-semibold">
                <Trophy className="size-5 text-highlight" aria-hidden="true" /> {contest.title}
              </p>
              {contest.phase === "upcoming" ? (
                <Countdown
                  target={contest.startsAt.toISOString()}
                  label="All-India mock opens in"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Live now · {contest.participants.toLocaleString("en-IN")} finished so far · same
                  questions for everyone
                </p>
              )}
            </div>
            <Button asChild>
              <Link href={`/contests/${contest.slug}`}>
                {contest.mine ? "Resume" : contest.phase === "live" ? "Take it now" : "Details"}{" "}
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Your stats
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Streak"
            value={
              <span className="flex items-center gap-1.5">
                {stats.streak}
                <Flame
                  className={
                    stats.streak ? "size-5 text-highlight" : "size-5 text-muted-foreground"
                  }
                  aria-hidden="true"
                />
              </span>
            }
            hint={`day${stats.streak === 1 ? "" : "s"} in a row · ${
              stats.streakFreezes
                ? `${stats.streakFreezes} freeze${stats.streakFreezes === 1 ? "" : "s"}`
                : `best ${stats.longestStreak}`
            }`}
          />
          <StatCard
            label="Questions answered"
            value={stats.attempts.toLocaleString("en-IN")}
            icon={BookOpenCheck}
            hint={`${stats.correct.toLocaleString("en-IN")} correct`}
          />
          <StatCard
            label="Accuracy"
            value={stats.accuracy === null ? "—" : `${stats.accuracy}%`}
            icon={Target}
            hint={stats.accuracy === null ? "After 10 answers" : "All time"}
          />
          <StatCard
            label="Today"
            value={usage.limit === null ? stats.todayCount : `${stats.todayCount}/${usage.limit}`}
            icon={CalendarDays}
            hint={usage.limit === null ? "questions answered" : "free questions used"}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Company readiness</CardTitle>
            <CardDescription>
              Mastery of the topics each company tests, weighted by how often they appear.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {targets.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No target companies yet"
                description="Pick up to 3 companies to see how ready you are for each."
                action={
                  <Button asChild>
                    <Link href="/onboarding">Choose companies</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {targets.map((target) => (
                  <li
                    key={target.companyId}
                    className="flex flex-col items-center gap-3 text-center"
                    data-testid="readiness"
                  >
                    <ReadinessRing score={target.score} label={`Readiness for ${target.name}`} />
                    <div className="space-y-0.5">
                      <Link
                        href={`/companies/${target.slug}`}
                        className="font-medium hover:underline"
                      >
                        {target.name}
                      </Link>
                      {daysLeftLabel(target.daysLeft, target.targetDate) ? (
                        <p className="text-xs text-muted-foreground">
                          {daysLeftLabel(target.daysLeft, target.targetDate)}
                        </p>
                      ) : null}
                    </div>
                    {target.score === null ? (
                      <p className="text-xs text-muted-foreground">Test pattern not added yet</p>
                    ) : (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/practice/session?company=${target.slug}`}>
                          Practise for {target.name.split(" ")[0]}
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Do next</CardTitle>
              <CardDescription>Picked for the biggest readiness gain.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {dailyId ? (
                <Link
                  href="/practice/daily"
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50"
                >
                  <CalendarDays className="size-4 text-primary" aria-hidden="true" />
                  <span className="flex-1">Question of the day</span>
                  {daily ? (
                    <CheckCircle2 className="size-4 text-success" aria-label="Done" />
                  ) : (
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </Link>
              ) : null}
              {nextTopic ? (
                <Link
                  href={`/practice/session?topic=${nextTopic.topicSlug}`}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50"
                >
                  <Target className="size-4 text-primary" aria-hidden="true" />
                  <span className="flex-1">
                    {nextTopic.topicName}
                    <span className="block text-xs text-muted-foreground">
                      {nextTopic.mastery}% mastery · for {nextTopic.company}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              ) : null}
              {stats.openMistakes ? (
                <Link
                  href="/practice/session?source=mistakes"
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50"
                >
                  <RotateCcw className="size-4 text-primary" aria-hidden="true" />
                  <span className="flex-1">
                    Retry {stats.openMistakes} mistake{stats.openMistakes === 1 ? "" : "s"}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              ) : null}
              <Link
                href="/asked/new"
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50"
              >
                <Megaphone className="size-4 text-primary" aria-hidden="true" />
                <span className="flex-1">
                  Had a drive today?
                  <span className="block text-xs text-muted-foreground">
                    Report what was asked and earn points
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
              {!dailyId && !nextTopic && !stats.openMistakes ? (
                <Button asChild className="w-full">
                  <Link href="/practice">Start practising</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {targets.some((t) => t.focus.length) ? (
            <Card>
              <CardHeader>
                <CardTitle>Work on</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {targets
                    .flatMap((t) => t.focus.slice(0, 2).map((f) => ({ ...f, company: t.name })))
                    .slice(0, 5)
                    .map((f) => (
                      <li
                        key={`${f.company}-${f.topicSlug}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <Link
                          href={`/practice/session?topic=${f.topicSlug}`}
                          className="hover:underline"
                        >
                          {f.topicName}
                        </Link>
                        <span className="tabular text-xs text-muted-foreground">{f.mastery}%</span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent answers</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState title="No answers yet" description="Your latest answers show up here." />
            ) : (
              <ul className="divide-y text-sm">
                {recent.map((attempt) => (
                  <li key={attempt.id} className="flex items-center gap-3 py-2.5">
                    {attempt.isCorrect ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Correct" />
                    ) : (
                      <XCircle className="size-4 shrink-0 text-destructive" aria-label="Wrong" />
                    )}
                    <Link
                      href={`/practice/session?topic=${attempt.question.topic.slug}`}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {attempt.question.topic.name}
                    </Link>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(attempt.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Replies to your reports</CardTitle>
            <CardDescription>
              When you report a problem with a question, our reply appears here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <EmptyState icon={MessageSquareReply} title="No replies yet" />
            ) : (
              <ul className="space-y-3 text-sm">
                {reports.map((report) => (
                  <li key={report.id} className="space-y-1 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={report.status === "FIXED" ? "secondary" : "outline"}>
                        {report.status === "FIXED" ? "Fixed" : "Checked: no change needed"}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {report.question.externalId}
                      </span>
                    </div>
                    <p>{report.reply}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
