import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { PostingStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { istDay } from "@/lib/learning/dates";
import { requirePermission } from "@/server/auth";
import { listPostingsForAdmin } from "@/server/services/job-postings";

export const metadata: Metadata = { title: "Job postings" };

export default function PostingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Job postings"
        description="Jobs students see on the jobs board. Students apply on the employer's site; clicks are counted here."
        actions={
          <Button asChild>
            <Link href="/admin/postings/new">
              <Plus /> New posting
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <PostingList />
      </Suspense>
    </div>
  );
}

async function PostingList() {
  await requirePermission("postings.manage");
  const postings = await listPostingsForAdmin();
  const today = istDay();
  return (
    <DataTable
      caption="Job postings"
      rows={postings}
      rowKey={(p) => p.id}
      emptyTitle="No job postings yet"
      emptyDescription="Post a job with New posting. It starts as a draft."
      columns={[
        {
          key: "title",
          header: "Job",
          cell: (p) => (
            <div className="min-w-0">
              <Link
                href={`/admin/postings/${p.id}`}
                className="font-medium text-primary hover:underline"
              >
                {p.title}
              </Link>
              <p className="text-xs text-muted-foreground">{p.companyName}</p>
            </div>
          ),
        },
        {
          key: "status",
          header: "Status",
          cell: (p) => <PostingStatusBadge posting={p} today={today} />,
        },
        {
          key: "apply",
          header: "Apply clicks",
          className: "tabular",
          cell: (p) => `${p.applyClicks} · ${p._count.saves} saved`,
        },
        {
          key: "applyBy",
          header: "Apply by",
          hideOnMobile: true,
          cell: (p) => (p.applyBy ? formatDate(p.applyBy) : "No deadline"),
        },
        {
          key: "posted",
          header: "Posted",
          hideOnMobile: true,
          cell: (p) => (p.publishedAt ? formatDate(p.publishedAt) : "—"),
        },
      ]}
    />
  );
}
