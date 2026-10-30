import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { ExperienceReview } from "@/app/admin/moderation/review-cards";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requirePermission } from "@/server/auth";
import { listForModeration } from "@/server/services/experiences";

export const metadata: Metadata = { title: "Interview experiences" };

export default function ExperiencesAdminPage({ searchParams }: PageProps<"/admin/experiences">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Interview experiences"
        description="Check each experience before it goes live: remove personal details and anything copied from a paid test, fix formatting."
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
  searchParams: PageProps<"/admin/experiences">["searchParams"];
}) {
  await requirePermission("experiences.moderate");
  const { error } = await searchParams;
  const pending = await listForModeration("PENDING");
  return (
    <div className="space-y-4">
      {typeof error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {pending.length === 0 ? (
        <EmptyState title="Nothing to review" description="New experiences appear here." />
      ) : null}
      {pending.map((x) => (
        <ExperienceReview key={x.id} x={x} back="/admin/experiences" />
      ))}
    </div>
  );
}
