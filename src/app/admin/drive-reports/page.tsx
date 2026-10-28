import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ROUND_TYPE_LABELS } from "@/lib/content/companies";
import { DIFFICULTY_LABELS } from "@/lib/content/workflow";
import { formatDate, formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import {
  listDriveReportsForModeration,
  moderateDriveReport,
} from "@/server/services/drive-reports";

export const metadata: Metadata = { title: "Drive reports" };

async function moderateAction(formData: FormData) {
  "use server";
  const actor = await requirePermission("experiences.moderate");
  const decision = z.enum(["approve", "reject"]).parse(formData.get("decision"));
  const result = await moderateDriveReport(
    z.string().max(40).parse(formData.get("id")),
    decision,
    actor,
    {
      questions: String(formData.get("questions") ?? "").trim() || undefined,
      topics: String(formData.get("topics") ?? "").trim() || null,
    },
    String(formData.get("note") ?? ""),
  );
  revalidatePath("/admin/drive-reports");
  if (result.ok) revalidatePath(`/companies/${result.companySlug}`);
  else redirect(`/admin/drive-reports?error=${encodeURIComponent(result.error)}`);
}

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
  const pending = await listDriveReportsForModeration("PENDING");
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
        <Card key={report.id} data-testid="pending-drive-report">
          <CardHeader>
            <CardTitle>
              <h2 className="text-base">
                {report.company.name} · {ROUND_TYPE_LABELS[report.roundType]} ·{" "}
                {formatDate(report.driveDate)}
              </h2>
            </CardTitle>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{DIFFICULTY_LABELS[report.difficulty]}</Badge>
              {report.platform ? <Badge variant="outline">{report.platform}</Badge> : null}
              {report.location ? <Badge variant="outline">{report.location}</Badge> : null}
              <span className="text-muted-foreground">
                {report.user.name} ({report.user.email}) · sent {formatDateTime(report.createdAt)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <form action={moderateAction} className="space-y-3">
              <input type="hidden" name="id" value={report.id} />
              <div className="space-y-1.5">
                <Label htmlFor={`topics-${report.id}`}>Sections or topics</Label>
                <Input
                  id={`topics-${report.id}`}
                  name="topics"
                  defaultValue={report.topics ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`questions-${report.id}`}>What was asked</Label>
                <Textarea
                  id={`questions-${report.id}`}
                  name="questions"
                  rows={5}
                  defaultValue={report.questions}
                />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1 space-y-1.5">
                  <Label htmlFor={`note-${report.id}`}>
                    Note to the student (required to reject)
                  </Label>
                  <Input id={`note-${report.id}`} name="note" maxLength={300} />
                </div>
                <Button
                  type="submit"
                  name="decision"
                  value="approve"
                  data-testid="approve-drive-report"
                >
                  Approve with edits
                </Button>
                <Button type="submit" name="decision" value="reject" variant="outline">
                  Reject
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
