import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  Bookmark,
  Building2,
  CalendarDays,
  CheckCircle2,
  History,
  RotateCcw,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MASTERY_LABELS, masteryLevel } from "@/lib/learning/mastery";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import {
  getPracticeCatalog,
  getStudentStats,
  getTargetReadiness,
} from "@/server/services/learning";
import { dailyAnswer, getDailyQuestionId } from "@/server/services/practice";

export const metadata: Metadata = { title: "Practice" };

export default function PracticePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PracticeHub />
    </Suspense>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
  testId,
}: {
  href: string;
  icon: typeof Bookmark;
  title: string;
  description: string;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-secondary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="truncate text-sm text-muted-foreground">{description}</p>
      </div>
      <ArrowRight
        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

async function PracticeHub() {
  const user = await requirePermission("student.access");
  const [catalog, stats, targets, dailyId] = await Promise.all([
    getPracticeCatalog(user.id),
    getStudentStats(user.id),
    getTargetReadiness(user.id),
    getDailyQuestionId(),
  ]);
  const daily = dailyId ? await dailyAnswer(user.id, dailyId) : null;
  const subjects = catalog.filter((s) => s.questions > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Practice"
        description="Pick a topic or a company. Questions go from easy to hard, with an explanation after each answer."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {dailyId ? (
          <QuickLink
            href="/practice/daily"
            icon={daily ? CheckCircle2 : CalendarDays}
            title="Question of the day"
            description={
              daily
                ? daily.isCorrect
                  ? "Done: you got it right"
                  : "Done: see the explanation"
                : "One question, every day"
            }
            testId="daily-question"
          />
        ) : null}
        <QuickLink
          href="/practice/session?source=mistakes"
          icon={RotateCcw}
          title="My mistakes"
          description={
            stats.openMistakes ? `${stats.openMistakes} to retry` : "Nothing to retry yet"
          }
          testId="mistakes-link"
        />
        <QuickLink
          href="/practice/session?source=bookmarks"
          icon={Bookmark}
          title="Bookmarks"
          description={stats.bookmarks ? `${stats.bookmarks} saved` : "Save questions to revisit"}
        />
        <QuickLink
          href="/practice/session?source=recent"
          icon={History}
          title="Recently asked"
          description="Questions candidates reported from real tests"
        />
      </div>

      {targets.length ? (
        <section aria-labelledby="company-practice" className="space-y-3">
          <h2 id="company-practice" className="text-lg font-semibold tracking-tight">
            For your target companies
          </h2>
          <div className="flex flex-wrap gap-2">
            {targets.map((target) => (
              <Link
                key={target.companyId}
                href={`/practice/session?company=${target.slug}`}
                className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-secondary/40"
              >
                <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                {target.name}
                {target.score !== null ? (
                  <Badge variant="secondary">{target.score}% ready</Badge>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="subjects" className="space-y-3">
        <h2 id="subjects" className="text-lg font-semibold tracking-tight">
          Subjects
        </h2>
        {subjects.length === 0 ? (
          <EmptyState
            title="No questions published yet"
            description="Questions appear here as soon as reviewers publish them."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject) => {
              const level =
                subject.averageMastery === null ? "new" : masteryLevel(subject.averageMastery, 1);
              return (
                <Link
                  key={subject.slug}
                  href={`/practice/${subject.slug}`}
                  className="group rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Card className="h-full transition-colors group-hover:border-primary/40">
                    <CardHeader>
                      <CardTitle>{subject.name}</CardTitle>
                      <CardDescription>
                        {subject.questions} question{subject.questions === 1 ? "" : "s"} ·{" "}
                        {subject.topics.filter((t) => t.questions > 0).length} topics
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            level === "strong"
                              ? "bg-success"
                              : level === "weak"
                                ? "bg-warning"
                                : "bg-primary",
                          )}
                          style={{ width: `${subject.averageMastery ?? 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {subject.averageMastery === null
                          ? "Not started"
                          : `Average mastery ${subject.averageMastery}% · ${MASTERY_LABELS[level]}`}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
