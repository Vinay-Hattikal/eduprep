import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PhaseBadge } from "@/components/contests/phase-badge";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { listContestsForAdmin } from "@/server/services/contests";

export const metadata: Metadata = { title: "All-India mocks" };

export default function ContestsAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="All-India mocks"
        description="Weekly tests everyone takes with the same questions, ranked live. Copy last week's, check it, publish."
        actions={
          <Button asChild>
            <Link href="/admin/contests/new">
              <Plus /> New contest
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <ContestList />
      </Suspense>
    </div>
  );
}

async function ContestList() {
  await requirePermission("contests.manage");
  const contests = await listContestsForAdmin();
  return (
    <DataTable
      caption="All-India mocks"
      rows={contests}
      rowKey={(c) => c.id}
      emptyTitle="No contests yet"
      emptyDescription="Create one from a mock test blueprint with New contest."
      columns={[
        {
          key: "title",
          header: "Contest",
          cell: (c) => (
            <div className="min-w-0">
              <Link
                href={`/admin/contests/${c.id}`}
                className="font-medium text-primary hover:underline"
              >
                {c.title}
              </Link>
              <p className="text-xs text-muted-foreground">{c.blueprint.title}</p>
            </div>
          ),
        },
        {
          key: "status",
          header: "Status",
          cell: (c) =>
            c.status === "PUBLISHED" ? (
              <PhaseBadge phase={c.phase} />
            ) : (
              <ContentStatusBadge status={c.status} />
            ),
        },
        {
          key: "when",
          header: "Opens",
          hideOnMobile: true,
          className: "whitespace-nowrap",
          cell: (c) => formatDateTime(c.startsAt),
        },
        {
          key: "taken",
          header: "Students",
          className: "tabular",
          cell: (c) => c._count.sittings.toLocaleString("en-IN"),
        },
      ]}
    />
  );
}
