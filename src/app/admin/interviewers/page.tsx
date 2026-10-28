import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, CircleAlert } from "lucide-react";
import { decideInterviewerAction } from "@/app/admin/interviews/actions";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { InterviewerStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { listInterviewersForAdmin, type InterviewerDecision } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Interviewers" };

const STATUS_TONES: Record<InterviewerStatus, string> = {
  APPLIED: "border-info/30 bg-info/10 text-info",
  APPROVED: "border-success/30 bg-success/10 text-success",
  REJECTED: "border-border bg-muted text-muted-foreground",
  SUSPENDED: "border-destructive/30 bg-destructive/10 text-destructive",
};

const ACTIONS: Record<
  InterviewerStatus,
  { decision: InterviewerDecision; label: string; variant: "default" | "outline" | "destructive" }[]
> = {
  APPLIED: [
    { decision: "approve", label: "Approve", variant: "default" },
    { decision: "reject", label: "Reject", variant: "outline" },
  ],
  APPROVED: [{ decision: "suspend", label: "Suspend", variant: "destructive" }],
  SUSPENDED: [{ decision: "reinstate", label: "Reinstate", variant: "outline" }],
  REJECTED: [],
};

export default function InterviewersPage({ searchParams }: PageProps<"/admin/interviewers">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Interviewers"
        description="Applications, approvals and quality: ratings, no-shows and profiles under review."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Interviewers searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Interviewers({
  searchParams,
}: {
  searchParams: PageProps<"/admin/interviewers">["searchParams"];
}) {
  await requirePermission("interviews.manage");
  const { error } = await searchParams;
  const rows = await listInterviewersForAdmin();

  return (
    <div className="space-y-4">
      {typeof error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {rows.length === 0 ? <EmptyState title="No applications yet" /> : null}
      <ul className="space-y-3">
        {rows.map((i) => (
          <li key={i.userId}>
            <Card data-testid="interviewer-row">
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{i.user.name}</p>
                  <Badge variant="outline" className={STATUS_TONES[i.status]}>
                    {i.status.toLowerCase()}
                  </Badge>
                  {i.flaggedAt ? (
                    <Badge
                      variant="outline"
                      className="border-warning/30 bg-warning/10 text-warning"
                    >
                      <AlertTriangle className="size-3" aria-hidden="true" /> Under review
                    </Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    applied {formatDate(i.appliedAt)}
                  </span>
                </div>
                <p className="text-sm">
                  {i.headline} · {i.currentRole} at {i.currentCompany}, {i.yearsExperience} yrs ·{" "}
                  <a
                    href={i.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    LinkedIn
                  </a>
                </p>
                <p className="text-sm text-muted-foreground">
                  {i.types.map((t) => t.name).join(", ")} · rating {i.rating ?? "—"} (
                  {i.ratingCount}) · {i._count.bookings} completed · {i.noShows} no-shows
                </p>
                <p className="line-clamp-2 text-sm">{i.bio}</p>
                <form
                  action={decideInterviewerAction}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="userId" value={i.userId} />
                  {ACTIONS[i.status].length || i.flaggedAt ? (
                    <Input
                      name="note"
                      placeholder="Note (sent with a rejection)"
                      className="max-w-xs"
                      maxLength={300}
                    />
                  ) : null}
                  {ACTIONS[i.status].map((a) => (
                    <Button
                      key={a.decision}
                      type="submit"
                      name="decision"
                      value={a.decision}
                      size="sm"
                      variant={a.variant}
                      data-testid={`interviewer-${a.decision}`}
                    >
                      {a.label}
                    </Button>
                  ))}
                  {i.flaggedAt ? (
                    <Button
                      type="submit"
                      name="decision"
                      value="clear-flag"
                      size="sm"
                      variant="ghost"
                    >
                      Clear review flag
                    </Button>
                  ) : null}
                </form>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
