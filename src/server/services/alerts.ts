import "server-only";

import {
  contestReminderAt,
  DIGEST_MAX_JOBS,
  jobMatchesStudent,
  nextDigestAt,
} from "@/lib/jobs/alerts";
import { formatDate } from "@/lib/format";
import { db } from "@/server/db";
import { enqueueJob } from "@/server/jobs/queue";
import { notify } from "@/server/services/notifications";

// Job alerts and contest reminders (D-059). Both go through notify(), which skips students who
// turned alerts off and writes to the outbox until real email and WhatsApp are connected.

const BATCH = 500;

/** Pages through students who want alerts, with what matching needs. */
async function* alertStudents() {
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.user.findMany({
      where: { roles: { has: "STUDENT" }, alertsOptIn: true, onboardedAt: { not: null } },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      select: {
        id: true,
        name: true,
        profileType: true,
        fresherProfile: {
          select: { branch: true, gradYear: true, cgpaBand: true, hasBacklogs: true },
        },
        experiencedProfile: { select: { yearsExperience: true } },
      },
    });
    if (!rows.length) return;
    yield rows;
    cursor = rows.at(-1)!.id;
  }
}

/**
 * Job "jobs.digest": one message per student listing the jobs published since `since` that
 * match their profile, then schedules the next digest. Each run covers the time since the
 * previous one, so no job is missed or sent twice.
 */
export async function sendJobDigest(since: string, now = new Date()) {
  const jobs = await db.jobPosting.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { gt: new Date(since), lte: now },
      OR: [{ applyBy: null }, { applyBy: { gte: now } }],
    },
    orderBy: { publishedAt: "desc" },
    select: {
      title: true,
      companyName: true,
      slug: true,
      applyBy: true,
      audience: true,
      minExperience: true,
      maxExperience: true,
      branches: true,
      gradYears: true,
      minCgpa: true,
      maxBacklogs: true,
    },
  });
  if (jobs.length) {
    for await (const students of alertStudents()) {
      for (const student of students) {
        const matching = jobs
          .filter((job) =>
            jobMatchesStudent(
              {
                profileType: student.profileType,
                fresher: student.fresherProfile,
                yearsExperience: student.experiencedProfile?.yearsExperience ?? null,
              },
              job,
            ),
          )
          .slice(0, DIGEST_MAX_JOBS);
        if (!matching.length) continue;
        await notify(student.id, "jobs.digest", {
          name: student.name,
          jobs: matching.map((j) => ({
            title: j.title,
            company: j.companyName,
            slug: j.slug,
            applyBy: j.applyBy ? formatDate(j.applyBy) : null,
          })),
        });
      }
    }
  }
  await scheduleJobDigest(now);
}

/** Queues the next digest unless one is already waiting (the worker calls this at start). */
export async function scheduleJobDigest(since = new Date()) {
  // The digest that's running calls this at its end; it isn't QUEUED, so it doesn't count.
  if (await db.job.count({ where: { type: "jobs.digest", status: "QUEUED" } })) return;
  await enqueueJob(
    "jobs.digest",
    { since: since.toISOString() },
    { runAt: nextDigestAt(since), maxAttempts: 3 },
  );
}

/** Queues the reminder for a contest that was just published. */
export async function scheduleContestReminder(contestId: string, startsAt: Date, now = new Date()) {
  const at = contestReminderAt(startsAt, now);
  if (at)
    await enqueueJob(
      "contest.reminder",
      { contestId, startsAt: startsAt.toISOString() },
      { runAt: at },
    );
}

/**
 * Job "contest.reminder": tells students who want reminders that an All-India mock opens soon.
 * Skipped if the contest was unpublished or moved since the reminder was queued.
 */
export async function sendContestReminder(contestId: string, startsAt: string) {
  const contest = await db.contest.findUnique({
    where: { id: contestId },
    select: { title: true, slug: true, status: true, startsAt: true },
  });
  if (!contest || contest.status !== "PUBLISHED" || contest.startsAt.toISOString() !== startsAt)
    return;
  for await (const students of alertStudents()) {
    for (const student of students) {
      await notify(student.id, "contest.reminder", {
        name: student.name,
        contest: contest.title,
        slug: contest.slug,
        startsAt,
      });
    }
  }
}
