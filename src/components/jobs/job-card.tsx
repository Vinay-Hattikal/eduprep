import Link from "next/link";
import { Briefcase, CalendarClock, CheckCircle2, IndianRupee, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { JOB_TYPE_LABELS, WORK_MODE_LABELS, experienceLabel } from "@/lib/jobs/postings";
import type { JobCard as JobCardData } from "@/server/services/job-postings";

const DAY_MS = 86_400_000;

/** "Posted today", "Posted 3 days ago". */
export function postedLabel(publishedAt: Date | null, now = new Date()): string | null {
  if (!publishedAt) return null;
  const days = Math.floor((now.getTime() - publishedAt.getTime()) / DAY_MS);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  return `Posted ${formatDate(publishedAt)}`;
}

/** One job in a list. The whole card links to the job; actions sit beside it. */
export function JobCard({
  job,
  applied,
  actions,
}: {
  job: JobCardData;
  applied?: Date;
  actions?: React.ReactNode;
}) {
  const experience = experienceLabel(job.minExperience, job.maxExperience);
  return (
    <article
      className="relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 sm:p-5"
      data-testid="job-card"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-lg font-semibold text-secondary-foreground"
        >
          {job.companyName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="leading-snug font-semibold">
            <Link
              href={`/jobs/${job.slug}`}
              className="after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:outline-none"
            >
              {job.title}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">{job.companyName}</p>
        </div>
        {actions ? <div className="relative z-10 shrink-0">{actions}</div> : null}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <li className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden="true" />
          {job.workMode === "REMOTE"
            ? "Remote"
            : `${job.locations.slice(0, 3).join(", ") || "India"}${job.locations.length > 3 ? ` +${job.locations.length - 3}` : ""}`}
        </li>
        <li className="inline-flex items-center gap-1">
          <Briefcase className="size-3.5" aria-hidden="true" />
          {experience ?? JOB_TYPE_LABELS[job.jobType]}
        </li>
        {job.salary ? (
          <li className="inline-flex items-center gap-1">
            <IndianRupee className="size-3.5" aria-hidden="true" /> {job.salary}
          </li>
        ) : null}
      </ul>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{JOB_TYPE_LABELS[job.jobType]}</Badge>
        {job.workMode !== "ONSITE" ? (
          <Badge variant="outline">{WORK_MODE_LABELS[job.workMode]}</Badge>
        ) : null}
        {job.skills.slice(0, 3).map((skill) => (
          <Badge key={skill} variant="outline" className="font-normal">
            {skill}
          </Badge>
        ))}
        <span className="ml-auto text-muted-foreground">
          {applied ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="size-3.5" aria-hidden="true" /> Applied {formatDate(applied)}
            </span>
          ) : job.applyBy ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden="true" /> Apply by{" "}
              {formatDate(job.applyBy)}
            </span>
          ) : (
            postedLabel(job.publishedAt)
          )}
        </span>
      </div>
    </article>
  );
}
