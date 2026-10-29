// Job alerts and contest reminders (D-059). Pure, so who gets which alert, and when, is
// unit-tested.

import type { ProfileType } from "@/generated/prisma/enums";
import { checkEligibility, overallEligibility } from "@/lib/learning/eligibility";

/** The daily job digest goes out at 18:00 IST (12:30 UTC). */
const DIGEST_UTC_MINUTES = 12 * 60 + 30;
/** At most this many jobs in one digest; the message links to the full list. */
export const DIGEST_MAX_JOBS = 10;
/** The contest reminder goes this long before the start. */
export const CONTEST_REMINDER_MS = 24 * 60 * 60 * 1000;
/** A contest published closer to its start than this gets no reminder. */
const MIN_REMINDER_LEAD_MS = 60 * 60 * 1000;

/** The next 18:00 IST strictly after `now`. */
export function nextDigestAt(now: Date): Date {
  const at = new Date(now);
  at.setUTCHours(Math.floor(DIGEST_UTC_MINUTES / 60), DIGEST_UTC_MINUTES % 60, 0, 0);
  if (at <= now) at.setUTCDate(at.getUTCDate() + 1);
  return at;
}

/** When to remind people of a contest: 24 h before, or right away if that has passed. */
export function contestReminderAt(startsAt: Date, now: Date): Date | null {
  if (startsAt.getTime() - now.getTime() < MIN_REMINDER_LEAD_MS) return null;
  const at = new Date(startsAt.getTime() - CONTEST_REMINDER_MS);
  return at > now ? at : now;
}

export type AlertStudent = {
  profileType: ProfileType | null;
  fresher: {
    branch: string | null;
    gradYear: number | null;
    cgpaBand: string | null;
    hasBacklogs: boolean;
  } | null;
  yearsExperience: number | null;
};

export type AlertJob = {
  audience: ProfileType[];
  minExperience: number | null;
  maxExperience: number | null;
  branches: string[];
  gradYears: number[];
  minCgpa: number | null;
  maxBacklogs: number | null;
};

/**
 * Whether a job is worth alerting this student about: it's for their kind of candidate, and
 * nothing in their profile rules them out. Missing profile details don't rule anyone out.
 */
export function jobMatchesStudent(student: AlertStudent, job: AlertJob): boolean {
  if (!student.profileType) return false;
  if (job.audience.length && !job.audience.includes(student.profileType)) return false;
  if (student.profileType === "FRESHER") {
    const profile = student.fresher ?? {
      branch: null,
      gradYear: null,
      cgpaBand: null,
      hasBacklogs: false,
    };
    return overallEligibility(checkEligibility(profile, job)) !== "fail";
  }
  const years = student.yearsExperience;
  if (years === null) return true;
  if (job.minExperience !== null && years < job.minExperience) return false;
  if (job.maxExperience !== null && years > job.maxExperience) return false;
  return true;
}
