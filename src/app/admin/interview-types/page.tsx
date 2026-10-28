import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupees } from "@/lib/commerce/pricing";
import { requirePermission } from "@/server/auth";
import { listAdminInterviewTypes } from "@/server/services/interview-types";

export const metadata: Metadata = { title: "Interview types" };

const AUDIENCE_LABELS = { FRESHER: "Freshers", EXPERIENCED: "Experienced", BOTH: "Everyone" };

export default function InterviewTypesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Interview types"
        description="What candidates can book: length, price and the rubric interviewers score."
        actions={
          <Button asChild>
            <Link href="/admin/interview-types/new">
              <Plus /> New type
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <Types />
      </Suspense>
    </div>
  );
}

async function Types() {
  await requirePermission("interviews.manage");
  const types = await listAdminInterviewTypes();
  return (
    <DataTable
      caption="Interview types"
      rows={types}
      rowKey={(t) => t.id}
      emptyTitle="No interview types"
      emptyDescription="Run the database seed, or create one with New type."
      columns={[
        {
          key: "name",
          header: "Type",
          cell: (t) => (
            <div>
              <Link
                href={`/admin/interview-types/${t.id}`}
                className="font-medium text-primary hover:underline"
              >
                {t.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {AUDIENCE_LABELS[t.audience]} · {t.durationMin} min
              </p>
            </div>
          ),
        },
        {
          key: "price",
          header: "Price",
          cell: (t) => <span className="tabular-nums">{formatRupees(t.pricePaise)}</span>,
        },
        {
          key: "rubric",
          header: "Rubric",
          hideOnMobile: true,
          cell: (t) => `${(t.rubric as unknown[]).length} items`,
        },
        {
          key: "use",
          header: "Used by",
          hideOnMobile: true,
          cell: (t) => (
            <span className="text-sm text-muted-foreground">
              {t._count.interviewers} interviewers · {t._count.bookings} bookings
            </span>
          ),
        },
        {
          key: "active",
          header: "Status",
          cell: (t) =>
            t.active ? (
              <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                Bookable
              </Badge>
            ) : (
              <Badge variant="outline">Off</Badge>
            ),
        },
      ]}
    />
  );
}
