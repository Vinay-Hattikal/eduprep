import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import { postingStatusAction } from "@/app/admin/postings/actions";
import { PostingForm } from "@/app/admin/postings/posting-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { JOB_STATUS_LABELS } from "@/lib/jobs/postings";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { getPostingForAdmin, type PostingStatusAction } from "@/server/services/job-postings";

export const metadata: Metadata = { title: "Job posting" };

export default function PostingPage({ params, searchParams }: PageProps<"/admin/postings/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/postings">
          <ArrowLeft /> Job postings
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <PostingDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const ACTIONS: Record<string, { action: PostingStatusAction; label: string; primary?: boolean }[]> =
  {
    DRAFT: [{ action: "publish", label: "Publish", primary: true }],
    PUBLISHED: [
      { action: "close", label: "Close applications" },
      { action: "unpublish", label: "Back to draft" },
    ],
    CLOSED: [
      { action: "reopen", label: "Reopen", primary: true },
      { action: "unpublish", label: "Back to draft" },
    ],
  };

const asText = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

async function PostingDetail({ params, searchParams }: PageProps<"/admin/postings/[id]">) {
  await requirePermission("postings.manage");
  const { id } = await params;
  const query = await searchParams;
  const [posting, companies] = await Promise.all([
    getPostingForAdmin(id),
    db.company.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!posting) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={posting.title}
        description={`${posting.companyName} · ${JOB_STATUS_LABELS[posting.status]}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {posting.status !== "DRAFT" ? (
              <Button asChild variant="ghost">
                <Link href={`/jobs/${posting.slug}`} target="_blank">
                  View <ExternalLink />
                </Link>
              </Button>
            ) : null}
            {ACTIONS[posting.status]!.map(({ action, label, primary }) => (
              <form key={action} action={postingStatusAction}>
                <input type="hidden" name="id" value={posting.id} />
                <Button
                  type="submit"
                  name="action"
                  value={action}
                  variant={primary ? "default" : "outline"}
                >
                  {label}
                </Button>
              </form>
            ))}
          </div>
        }
      />
      {typeof query.error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : query.saved || query.done ? (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>{query.saved ? "Saved." : "Status updated."}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Apply clicks"
          value={posting.applyClicks}
          hint="Students sent to the employer"
        />
        <StatCard label="Signed-in applicants" value={posting._count.applyRecords} />
        <StatCard label="Saved by" value={posting._count.saves} hint="students" />
      </div>

      <PostingForm
        companies={companies}
        values={{
          id: posting.id,
          title: posting.title,
          companyId: posting.companyId ?? "",
          companyName: posting.companyName,
          locations: posting.locations.join(", "),
          workMode: posting.workMode,
          jobType: posting.jobType,
          audience: posting.audience,
          minExperience: asText(posting.minExperience),
          maxExperience: asText(posting.maxExperience),
          salary: posting.salary ?? "",
          skills: posting.skills.join(", "),
          description: posting.description,
          branches: posting.branches.join(", "),
          gradYears: posting.gradYears.join(", "),
          minCgpa: asText(posting.minCgpa),
          maxBacklogs: asText(posting.maxBacklogs),
          applyUrl: posting.applyUrl,
          applyBy: posting.applyBy ? posting.applyBy.toISOString().slice(0, 10) : "",
        }}
      />
    </div>
  );
}
