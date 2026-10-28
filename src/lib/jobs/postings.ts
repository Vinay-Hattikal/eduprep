// Job postings (D-050): labels and rules shared by admin forms, pages and the server.

import type { JobPostingStatus, JobType, WorkMode } from "@/generated/prisma/enums";
import { dayKey } from "@/lib/learning/dates";

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  FULL_TIME: "Full-time",
  INTERNSHIP: "Internship",
  CONTRACT: "Contract",
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  ONSITE: "On-site",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
};

export const JOB_STATUS_LABELS: Record<JobPostingStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CLOSED: "Closed",
};

/** Only http(s) links to other sites: never javascript:, data: or relative URLs. */
export function isSafeApplyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Open for applications: published and the last day to apply (IST) hasn't passed. */
export function isAcceptingApplications(
  job: { status: JobPostingStatus; applyBy: Date | null },
  today: Date,
): boolean {
  if (job.status !== "PUBLISHED") return false;
  return !job.applyBy || dayKey(job.applyBy) >= dayKey(today);
}

/** "0–2 years", "3+ years", "Freshers" or null. */
export function experienceLabel(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if ((min ?? 0) === 0 && max === 0) return "Freshers";
  if (max === null) return `${min}+ years`;
  return `${min ?? 0}–${max} year${max === 1 ? "" : "s"}`;
}

/** URL slug from a title and company, with a short suffix so reposts don't collide. */
export function jobSlug(title: string, companyName: string, suffix: string): string {
  const base = `${companyName} ${title}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
  return `${base || "job"}-${suffix}`;
}
