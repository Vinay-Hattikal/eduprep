import Link from "next/link";
import { Plus } from "lucide-react";
import {
  DriveReportReview,
  ExperienceReview,
  TurnIntoQuestion,
} from "@/app/admin/moderation/review-cards";
import { EmptyState } from "@/components/shared/empty-state";
import { PostingStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUND_TYPE_LABELS } from "@/lib/content/companies";
import { formatDate, plainExcerpt } from "@/lib/format";
import { istDay } from "@/lib/learning/dates";
import { listDriveReportsForModeration } from "@/server/services/drive-reports";
import { listForModeration } from "@/server/services/experiences";
import { listPostingsForAdmin } from "@/server/services/job-postings";

/**
 * What students and employers add about a company (D-067): interview experiences and "asked in
 * recent drives" reports to review, recent approved reports to turn into questions, and its job
 * postings. The same review cards and rules as the moderation queues.
 */
export async function CommunityTab({
  company,
}: {
  company: { id: string; slug: string; name: string };
}) {
  const [experiences, reports, approved, postings] = await Promise.all([
    listForModeration({ companyId: company.id }),
    listDriveReportsForModeration({ companyId: company.id }),
    listDriveReportsForModeration({ status: "APPROVED", companyId: company.id, take: 10 }),
    listPostingsForAdmin({ companyId: company.id }),
  ]);
  const today = istDay();

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="community-review">
        <h2 id="community-review" className="text-lg font-semibold tracking-tight">
          To review{" "}
          <span className="font-normal text-muted-foreground">
            ({experiences.length + reports.length})
          </span>
        </h2>
        {experiences.length + reports.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            description={`New interview experiences and drive reports for ${company.name} appear here.`}
          />
        ) : null}
        {reports.map((report) => (
          <DriveReportReview key={report.id} report={report} fromCompany />
        ))}
        {experiences.map((x) => (
          <ExperienceReview key={x.id} x={x} fromCompany />
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Asked in recent drives</h2>
          </CardTitle>
          <CardDescription>
            Approved reports. Turn what was asked into practice questions for {company.name}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {approved.length ? (
            <ul className="divide-y rounded-lg border">
              {approved.map((report) => (
                <li
                  key={report.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm"
                >
                  <span className="text-muted-foreground">
                    {formatDate(report.driveDate)} · {ROUND_TYPE_LABELS[report.roundType]}
                  </span>
                  <span className="min-w-0 flex-1 basis-48 truncate">
                    {plainExcerpt(report.questions, 120)}
                  </span>
                  <TurnIntoQuestion report={report} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No approved reports yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>
              <h2>Job postings</h2>
            </CardTitle>
            <CardDescription>Openings at {company.name} on the jobs board.</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/postings/new?company=${company.slug}`}>
              <Plus /> Post a job
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {postings.length ? (
            <ul className="divide-y rounded-lg border">
              {postings.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                  <Link
                    href={`/admin/postings/${p.id}`}
                    className="min-w-0 flex-1 basis-48 truncate font-medium text-primary hover:underline"
                  >
                    {p.title}
                  </Link>
                  <PostingStatusBadge posting={p} today={today} />
                  <span className="text-xs text-muted-foreground">
                    {p.applyBy ? `apply by ${formatDate(p.applyBy)} · ` : ""}
                    {p.applyClicks} apply clicks
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No postings yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
