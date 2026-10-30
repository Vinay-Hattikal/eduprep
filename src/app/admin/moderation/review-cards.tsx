import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import {
  moderateDriveReportAction,
  moderateExperienceAction,
} from "@/app/admin/moderation/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ROUND_TYPE_LABELS } from "@/lib/content/companies";
import { DIFFICULTY_LABELS } from "@/lib/content/workflow";
import { formatDate, formatDateTime } from "@/lib/format";
import type { listDriveReportsForModeration } from "@/server/services/drive-reports";
import { RESULT_LABELS, type listForModeration } from "@/server/services/experiences";

// The review cards of the moderation queues, shared with a company's Community tab (D-067).

type Experience = Awaited<ReturnType<typeof listForModeration>>[number];
type DriveReport = Awaited<ReturnType<typeof listDriveReportsForModeration>>[number];

function Decision({ id, note, testId }: { id: string; note: string; testId: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor={`note-${id}`}>{note}</Label>
        <Input id={`note-${id}`} name="note" maxLength={300} />
      </div>
      <Button type="submit" name="decision" value="approve" data-testid={testId}>
        Approve with edits
      </Button>
      <Button type="submit" name="decision" value="reject" variant="outline">
        Reject
      </Button>
    </div>
  );
}

export function ExperienceReview({ x, back }: { x: Experience; back: string }) {
  return (
    <Card data-testid="pending-experience">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">
            {x.company.name} · {x.role} · {x.year}
          </h2>
        </CardTitle>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{x.profileType.toLowerCase()}</Badge>
          <Badge variant="outline">{RESULT_LABELS[x.result]}</Badge>
          <span className="text-muted-foreground">
            {x.user.name} ({x.user.email}) · {x.anonymous ? "anonymous" : "named"} ·{" "}
            {formatDate(x.createdAt)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <form action={moderateExperienceAction} className="space-y-3">
          <input type="hidden" name="id" value={x.id} />
          <input type="hidden" name="back" value={back} />
          <div className="space-y-1.5">
            <Label htmlFor={`rounds-${x.id}`}>Rounds</Label>
            <Textarea id={`rounds-${x.id}`} name="rounds" rows={5} defaultValue={x.rounds} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`questions-${x.id}`}>Questions</Label>
            <Textarea
              id={`questions-${x.id}`}
              name="questions"
              rows={4}
              defaultValue={x.questions}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`tips-${x.id}`}>Tips</Label>
            <Textarea id={`tips-${x.id}`} name="tips" rows={2} defaultValue={x.tips ?? ""} />
          </div>
          <Decision
            id={x.id}
            note="Note to the contributor (required to reject)"
            testId="approve-experience"
          />
        </form>
      </CardContent>
    </Card>
  );
}

export function DriveReportReview({ report, back }: { report: DriveReport; back: string }) {
  return (
    <Card data-testid="pending-drive-report">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">
            {report.company.name} · {ROUND_TYPE_LABELS[report.roundType]} ·{" "}
            {formatDate(report.driveDate)}
          </h2>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">{DIFFICULTY_LABELS[report.difficulty]}</Badge>
          {report.platform ? <Badge variant="outline">{report.platform}</Badge> : null}
          {report.location ? <Badge variant="outline">{report.location}</Badge> : null}
          <span className="text-muted-foreground">
            {report.user.name} ({report.user.email}) · sent {formatDateTime(report.createdAt)}
          </span>
          <TurnIntoQuestion report={report} />
        </div>
      </CardHeader>
      <CardContent>
        <form action={moderateDriveReportAction} className="space-y-3">
          <input type="hidden" name="id" value={report.id} />
          <input type="hidden" name="back" value={back} />
          <div className="space-y-1.5">
            <Label htmlFor={`topics-${report.id}`}>Sections or topics</Label>
            <Input id={`topics-${report.id}`} name="topics" defaultValue={report.topics ?? ""} />
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
          <Decision
            id={report.id}
            note="Note to the student (required to reject)"
            testId="approve-drive-report"
          />
        </form>
      </CardContent>
    </Card>
  );
}

/** A new question for the report's company, prefilled from what the student reported. */
export function TurnIntoQuestion({
  report,
}: {
  report: { id: string; company: { slug: string } };
}) {
  return (
    <Button asChild size="sm" variant="ghost" className="ml-auto">
      <Link href={`/admin/questions/new?company=${report.company.slug}&fromReport=${report.id}`}>
        <FilePlus2 /> Turn into a question
      </Link>
    </Button>
  );
}
