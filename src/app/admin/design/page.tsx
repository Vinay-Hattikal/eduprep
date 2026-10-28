import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileUp, Plus } from "lucide-react";
import { setDesignStatusAction } from "@/app/admin/design/actions";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge, DifficultyLabel } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { DESIGN_KIND_LABELS } from "@/server/services/tracks";

export const metadata: Metadata = { title: "Design questions" };

export default function DesignAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Design questions"
        description="System design and low-level design questions. New and edited questions are drafts until a reviewer publishes them."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/imports">
                <FileUp /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/design/new">
                <Plus /> New question
              </Link>
            </Button>
          </>
        }
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Questions />
      </Suspense>
    </div>
  );
}

async function Questions() {
  const user = await requirePermission("content.view");
  const questions = await db.designQuestion.findMany({
    orderBy: [{ status: "asc" }, { title: "asc" }],
  });
  const canPublish = can(user.roles, "content.publish");
  return (
    <DataTable
      caption="Design questions"
      rows={questions}
      rowKey={(q) => q.id}
      emptyTitle="No design questions"
      emptyDescription="Write one with New question, or import design/design-questions.csv."
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
        {
          key: "difficulty",
          header: "Difficulty",
          hideOnMobile: true,
          cell: (q) => <DifficultyLabel difficulty={q.difficulty} />,
        },
        { key: "status", header: "Status", cell: (q) => <ContentStatusBadge status={q.status} /> },
        {
          key: "actions",
          header: "",
          cell: (q) =>
            canPublish && q.status !== "ARCHIVED" ? (
              <form action={setDesignStatusAction}>
                <input type="hidden" name="id" value={q.id} />
                <input
                  type="hidden"
                  name="status"
                  value={q.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant={q.status === "PUBLISHED" ? "ghost" : "default"}
                >
                  {q.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                </Button>
              </form>
            ) : null,
        },
      ]}
    />
  );
}
