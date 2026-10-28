import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { QuestionsTable } from "@/app/admin/questions/questions-table";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { DifficultyLabel } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, plainExcerpt } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { DESIGN_KIND_LABELS } from "@/server/services/tracks";

export const metadata: Metadata = { title: "Drafts" };

const DRAFT = { in: ["DRAFT" as const, "IN_REVIEW" as const] };
const LIMIT = 200;

export default function DraftsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Drafts"
        description="Everything written or imported but not yet live. Students don't see drafts."
      />
      <Suspense fallback={<TableSkeleton />}>
        <Drafts />
      </Suspense>
    </div>
  );
}

async function Drafts() {
  await requirePermission("content.publish");
  const [questions, problems, design] = await Promise.all([
    db.question.findMany({
      where: { status: DRAFT },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
      select: {
        id: true,
        externalId: true,
        text: true,
        type: true,
        difficulty: true,
        status: true,
        updatedAt: true,
        subject: { select: { name: true } },
        topic: { select: { name: true } },
      },
    }),
    db.problem.findMany({
      where: { status: DRAFT },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
      select: {
        id: true,
        externalId: true,
        title: true,
        difficulty: true,
        validatedAt: true,
        updatedAt: true,
      },
    }),
    db.designQuestion.findMany({
      where: { status: DRAFT },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
      select: { id: true, externalId: true, title: true, kind: true, updatedAt: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Questions ({questions.length})</h2>
          </CardTitle>
          <CardDescription>
            Select several and choose Publish to put them live together. Questions that fail the
            automatic checks are skipped and listed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {questions.length ? (
            <QuestionsTable
              bulkActions={["publish", "archive"]}
              rows={questions.map((q) => ({
                id: q.id,
                externalId: q.externalId,
                excerpt: plainExcerpt(q.text, 160),
                subject: q.subject.name,
                topic: q.topic.name,
                type: q.type,
                difficulty: q.difficulty,
                status: q.status,
                updated: formatDate(q.updatedAt),
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No draft questions.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Coding problems ({problems.length})</h2>
          </CardTitle>
          <CardDescription>
            Open a problem to publish it. It goes live once it passes the judge check.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Draft coding problems"
            rows={problems}
            rowKey={(p) => p.id}
            emptyTitle="No draft coding problems"
            columns={[
              {
                key: "title",
                header: "Problem",
                cell: (p) => (
                  <div>
                    <Link
                      href={`/admin/problems/${p.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.title}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{p.externalId}</p>
                  </div>
                ),
              },
              {
                key: "difficulty",
                header: "Difficulty",
                hideOnMobile: true,
                cell: (p) => <DifficultyLabel difficulty={p.difficulty} />,
              },
              {
                key: "judge",
                header: "Judge check",
                cell: (p) => (
                  <span className={p.validatedAt ? "text-success" : "text-muted-foreground"}>
                    {p.validatedAt ? "Passed" : "Not passed yet"}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Design questions ({design.length})</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Draft design questions"
            rows={design}
            rowKey={(q) => q.id}
            emptyTitle="No draft design questions"
            columns={[
              {
                key: "title",
                header: "Question",
                cell: (q) => (
                  <div>
                    <Link
                      href={`/admin/design/${q.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {q.title}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{q.externalId}</p>
                  </div>
                ),
              },
              {
                key: "kind",
                header: "Kind",
                hideOnMobile: true,
                cell: (q) => DESIGN_KIND_LABELS[q.kind],
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
