import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BarChart3 } from "lucide-react";
import { ColumnChart, LineChart } from "@/components/charts/simple-charts";
import { MasteryBar } from "@/components/learning/mastery-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shortDay, weeklyAccuracy } from "@/lib/learning/series";
import { requirePermission } from "@/server/auth";
import { getDailySeries, getMasteryBySubject, getStudentStats } from "@/server/services/learning";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Progress />
    </Suspense>
  );
}

async function Progress() {
  const user = await requirePermission("student.access");
  const [stats, daily, weeks56, subjects] = await Promise.all([
    getStudentStats(user.id),
    getDailySeries(user.id, 30),
    getDailySeries(user.id, 56),
    getMasteryBySubject(user.id),
  ]);
  const weeks = weeklyAccuracy(weeks56);
  const avgTimes = daily.filter((d) => d.avgTimeSec !== null);
  const avgTime = avgTimes.length
    ? Math.round(
        avgTimes.reduce((s, d) => s + d.avgTimeSec! * d.answered, 0) /
          avgTimes.reduce((s, d) => s + d.answered, 0),
      )
    : null;

  if (stats.attempts === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Progress" description="Topic mastery, accuracy and speed over time." />
        <EmptyState
          icon={BarChart3}
          title="Nothing to show yet"
          description="Answer a few questions and your progress appears here."
          action={
            <Button asChild>
              <Link href="/practice">Start practising</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Progress" description="Topic mastery, accuracy and speed over time." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Questions answered" value={stats.attempts.toLocaleString("en-IN")} />
        <StatCard
          label="Accuracy"
          value={stats.accuracy === null ? "—" : `${stats.accuracy}%`}
          hint={stats.accuracy === null ? "After 10 answers" : undefined}
        />
        <StatCard
          label="Average time"
          value={avgTime === null ? "—" : `${avgTime}s`}
          hint="per question, last 30 days"
        />
        <StatCard
          label="Longest streak"
          value={`${stats.longestStreak} day${stats.longestStreak === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent>
            <ColumnChart
              title="Questions answered per day, last 30 days"
              data={daily.map((d) => ({
                label: shortDay(d.day),
                value: d.answered,
                detail: d.answered ? `${d.correct} correct` : undefined,
              }))}
              labelEvery={7}
              valueHeader="Answered"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <LineChart
              title="Accuracy per week, last 8 weeks"
              data={weeks.map((w) => ({
                label: w.label.replace("w/c ", ""),
                value: w.accuracy,
                detail: `${w.answered} answered`,
              }))}
              max={100}
              valueFormat="percent"
              valueHeader="Accuracy"
            />
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="mastery-heading" className="space-y-3">
        <h2 id="mastery-heading" className="text-lg font-semibold tracking-tight">
          Topic mastery
        </h2>
        <p className="text-sm text-muted-foreground">
          Weakest first. Mastery weighs recent answers and harder questions more, so it rises as you
          improve.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {subjects.map((subject) => (
            <Card key={subject.slug}>
              <CardHeader>
                <CardTitle>{subject.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {subject.topics.map((topic) => (
                  <Link
                    key={topic.slug}
                    href={`/practice/session?topic=${topic.slug}`}
                    className="block rounded-md hover:bg-muted/40"
                  >
                    <MasteryBar label={topic.name} score={topic.score} attempts={topic.attempts} />
                    <span className="sr-only">
                      {topic.correct} of {topic.attempts} correct. Practise {topic.name}.
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
