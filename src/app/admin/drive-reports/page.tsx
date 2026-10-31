import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { DriveReportReview } from "@/app/admin/moderation/review-cards";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requirePermission } from "@/server/auth";
import { listDriveReportsForModeration } from "@/server/services/drive-reports";

export const metadata: Metadata = { title: "Drive reports" };

export default function DriveReportsPage({ searchParams }: PageProps<"/admin/drive-reports">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Drive reports"
        description={`"Asked today" reports from students. Check them quickly: they matter most in the first hours. Remove personal details and anything copied word for word from a test.`}
      />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Queue({
  searchParams,
}: {
  searchParams: PageProps<"/admin/drive-reports">["searchParams"];
}) {
  await requirePermission("experiences.moderate");
  const { error } = await searchParams;
  const pending = await listDriveReportsForModeration();
  return (
    <div className="space-y-4">
      {typeof error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {pending.length === 0 ? (
        <EmptyState title="Nothing to review" description="New drive reports appear here." />
      ) : null}
      {pending.map((report) => (
        <DriveReportReview key={report.id} report={report} />
      ))}
    </div>
  );
}
