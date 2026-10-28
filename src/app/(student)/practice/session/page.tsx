import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PracticePlayer } from "@/components/practice/practice-player";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import type { Difficulty } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import {
  countQuestions,
  nextQuestion,
  PRACTICE_SOURCES,
  practiceUsage,
  type PracticeFilter,
  type PracticeSource,
} from "@/server/services/practice";

export const metadata: Metadata = { title: "Practice session" };

const SOURCE_TITLES: Record<PracticeSource, string> = {
  all: "Practice",
  unattempted: "New questions",
  mistakes: "Retry your mistakes",
  bookmarks: "Your bookmarks",
  recent: "Recently asked questions",
};

const slug = (value: unknown) =>
  typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value) ? value : undefined;

export default function SessionPage({ searchParams }: PageProps<"/practice/session">) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/practice">
          <ArrowLeft /> Practice
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Session searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Session({
  searchParams,
}: {
  searchParams: PageProps<"/practice/session">["searchParams"];
}) {
  const user = await requirePermission("student.access");
  const query = await searchParams;
  const source = PRACTICE_SOURCES.includes(query.source as PracticeSource)
    ? (query.source as PracticeSource)
    : "all";
  const difficulty = ["EASY", "MEDIUM", "HARD"].includes(String(query.difficulty))
    ? (query.difficulty as Difficulty)
    : undefined;
  const filter: PracticeFilter = {
    subject: slug(query.subject),
    topic: slug(query.topic),
    subtopic: slug(query.subtopic),
    company: slug(query.company),
    difficulty,
    source,
  };

  const [first, total, usage, topic, subject, company] = await Promise.all([
    nextQuestion(user.id, filter, []),
    countQuestions(user.id, filter),
    practiceUsage(user),
    filter.topic
      ? db.topic.findUnique({
          where: { slug: filter.topic },
          select: { name: true, subject: { select: { slug: true } } },
        })
      : null,
    filter.subject
      ? db.subject.findUnique({ where: { slug: filter.subject }, select: { name: true } })
      : null,
    filter.company
      ? db.company.findFirst({
          where: { slug: filter.company, status: "PUBLISHED" },
          select: { name: true },
        })
      : null,
  ]);

  const title = company
    ? `${company.name} practice`
    : (topic?.name ?? subject?.name ?? SOURCE_TITLES[source]);
  const emptyHref = topic ? `/practice/${topic.subject.slug}` : "/practice";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={`${total} question${total === 1 ? "" : "s"} in this set.`}
      />
      <PracticePlayer
        initial={first}
        filter={filter}
        mode={source === "mistakes" ? "RETRY" : "PRACTICE"}
        usage={usage}
        emptyHref={emptyHref}
      />
    </div>
  );
}
