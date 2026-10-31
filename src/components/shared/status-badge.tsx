import type { ContentStatus, ImportStatus, JobPostingStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { VERDICT_LABELS, type VerdictName } from "@/lib/coding/languages";
import { STATUS_LABELS } from "@/lib/content/workflow";
import { isAcceptingApplications, JOB_STATUS_LABELS } from "@/lib/jobs/postings";
import { cn } from "@/lib/utils";

const CONTENT_STYLES: Record<ContentStatus, string> = {
  DRAFT: "border-border bg-muted text-muted-foreground",
  IN_REVIEW: "border-info/30 bg-info/10 text-info",
  PUBLISHED: "border-success/30 bg-success/10 text-success",
  ARCHIVED: "border-border bg-transparent text-muted-foreground line-through",
};

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  return (
    <Badge variant="outline" className={cn(CONTENT_STYLES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  QUEUED: "Queued",
  VALIDATING: "Checking",
  PREVIEW_READY: "Ready to import",
  COMMITTING: "Importing",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  ROLLED_BACK: "Undone",
};

const IMPORT_STYLES: Record<ImportStatus, string> = {
  QUEUED: "border-border bg-muted text-muted-foreground",
  VALIDATING: "border-info/30 bg-info/10 text-info",
  PREVIEW_READY: "border-warning/30 bg-warning/10 text-warning",
  COMMITTING: "border-info/30 bg-info/10 text-info",
  COMPLETED: "border-success/30 bg-success/10 text-success",
  FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
  CANCELLED: "border-border bg-transparent text-muted-foreground",
  ROLLED_BACK: "border-border bg-transparent text-muted-foreground",
};

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  return (
    <Badge variant="outline" className={cn(IMPORT_STYLES[status])}>
      {IMPORT_STATUS_LABELS[status]}
    </Badge>
  );
}

const DIFFICULTY_STYLES = {
  EASY: "text-difficulty-easy",
  MEDIUM: "text-difficulty-medium",
  HARD: "text-difficulty-hard",
} as const;

export function DifficultyLabel({ difficulty }: { difficulty: keyof typeof DIFFICULTY_STYLES }) {
  return (
    <span className={cn("text-xs font-medium", DIFFICULTY_STYLES[difficulty])}>
      {difficulty.charAt(0) + difficulty.slice(1).toLowerCase()}
    </span>
  );
}

const VERDICT_STYLES: Record<VerdictName, string> = {
  PENDING: "border-border bg-muted text-muted-foreground",
  RUNNING: "border-info/30 bg-info/10 text-info",
  ACCEPTED: "border-success/30 bg-success/10 text-success",
  WRONG_ANSWER: "border-destructive/30 bg-destructive/10 text-destructive",
  TIME_LIMIT: "border-warning/30 bg-warning/10 text-warning",
  MEMORY_LIMIT: "border-warning/30 bg-warning/10 text-warning",
  RUNTIME_ERROR: "border-destructive/30 bg-destructive/10 text-destructive",
  COMPILATION_ERROR: "border-warning/30 bg-warning/10 text-warning",
  INTERNAL_ERROR: "border-border bg-muted text-muted-foreground",
};

export function VerdictBadge({ verdict, label }: { verdict: VerdictName; label?: string }) {
  return (
    <Badge variant="outline" className={cn(VERDICT_STYLES[verdict])}>
      {label ?? VERDICT_LABELS[verdict]}
    </Badge>
  );
}

const POSTING_STYLES: Record<JobPostingStatus, string> = {
  DRAFT: "border-muted-foreground/30 text-muted-foreground",
  PUBLISHED: "border-success/40 bg-success/10 text-success",
  CLOSED: "border-warning/40 text-warning",
};

/** A job posting's status; a published one past its apply-by date shows as expired. */
export function PostingStatusBadge({
  posting,
  today,
}: {
  posting: { status: JobPostingStatus; applyBy: Date | null };
  today: Date;
}) {
  const expired = posting.status === "PUBLISHED" && !isAcceptingApplications(posting, today);
  return (
    <Badge variant="outline" className={POSTING_STYLES[expired ? "CLOSED" : posting.status]}>
      {expired ? "Expired" : JOB_STATUS_LABELS[posting.status]}
    </Badge>
  );
}
