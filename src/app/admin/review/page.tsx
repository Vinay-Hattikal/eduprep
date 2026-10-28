import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardCheck } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { DifficultyLabel } from "@/components/shared/status-badge";
import { formatDateTime, plainExcerpt } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Review queue" };

export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Review queue"
        description="Questions waiting for approval, oldest first. Solve each one before reading the answer."
      />
      <Suspense fallback={<TableSkeleton />}>
        <ReviewQueue />
      </Suspense>
    </div>
  );
}

async function ReviewQueue() {
  const user = await requirePermission("content.publish");
  const questions = await db.question.findMany({
    where: { status: "IN_REVIEW" },
    orderBy: { submittedAt: "asc" },
    take: 200,
    select: {
      id: true,
      externalId: true,
      text: true,
      difficulty: true,
      submittedAt: true,
      authorId: true,
      author: { select: { name: true } },
      topic: { select: { name: true } },
      subject: { select: { name: true } },
    },
  });

  return (
    <DataTable
      caption="Questions in review"
      rows={questions}
      rowKey={(q) => q.id}
      emptyTitle="Nothing to review"
      emptyDescription="Questions appear here when an author submits them for review."
      columns={[
        {
          key: "question",
          header: "Question",
          cell: (q) => (
            <div className="max-w-xl">
              <Link
                href={`/admin/questions/${q.id}`}
                className="font-mono text-xs font-medium text-primary hover:underline"
              >
                {q.externalId}
              </Link>
              <p className="line-clamp-2">{plainExcerpt(q.text, 160)}</p>
              {q.authorId === user.id ? (
                <p className="text-xs text-muted-foreground">
                  <ClipboardCheck className="mr-1 inline size-3" aria-hidden="true" />
                  You wrote this one
                </p>
              ) : null}
            </div>
          ),
        },
        {
          key: "topic",
          header: "Topic",
          hideOnMobile: true,
          cell: (q) => (
            <div>
              <p>{q.topic.name}</p>
              <DifficultyLabel difficulty={q.difficulty} />
            </div>
          ),
        },
        {
          key: "submitted",
          header: "Submitted",
          hideOnMobile: true,
          className: "whitespace-nowrap text-muted-foreground",
          cell: (q) => (
            <span>
              {q.submittedAt ? formatDateTime(q.submittedAt) : "—"}
              {q.author ? <span className="block text-xs">{q.author.name}</span> : null}
            </span>
          ),
        },
      ]}
    />
  );
}
