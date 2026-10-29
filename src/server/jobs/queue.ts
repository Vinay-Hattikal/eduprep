// Durable background jobs in PostgreSQL (D-029): jobs survive restarts, failed jobs retry with
// exponential backoff, and SKIP LOCKED makes sure two workers never run the same job. With
// QUEUE_DRIVER=bullmq, Redis delivers jobs to workers instantly (dispatch.ts, D-046); this
// table stays the record either way.

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { notifyWorkers } from "@/server/jobs/dispatch";
import { backoffMs, STALE_LOCK_MS } from "@/server/jobs/retry";

export const JOB_TYPES = [
  "import.validate",
  "import.commit",
  "code.judge",
  "problem.validate",
  "test.autosubmit",
  "notification.send",
  "booking.meeting",
  "booking.reminder",
  "scorecard.overdue",
  "contest.finalize",
  "jobs.digest",
  "contest.reminder",
  "pack.import",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type JobPayloads = {
  "import.validate": { batchId: string };
  "import.commit": { batchId: string };
  "code.judge": { submissionId: string };
  /** publishBy: an admin asked to publish once the check passes (D-056). */
  "problem.validate": { problemId: string; publishBy?: string };
  "test.autosubmit": { sittingId: string };
  "notification.send": { notificationId: string };
  "booking.meeting": { bookingId: string; action: "create" | "update" | "cancel" };
  "booking.reminder": { bookingId: string; when: "24h" | "1h"; startsAt: string };
  "scorecard.overdue": { bookingId: string; endsAt: string };
  "contest.finalize": { contestId: string };
  /** Covers jobs published after `since` (the previous digest). */
  "jobs.digest": { since: string };
  "contest.reminder": { contestId: string; startsAt: string };
  "pack.import": { packId: string };
};

/** A job to queue, for code that describes work without queuing it itself. */
export type JobRequest = { [T in JobType]: { type: T; payload: JobPayloads[T] } }[JobType];

export type ClaimedJob = {
  id: string;
  type: JobType;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

export async function enqueueJob<T extends JobType>(
  type: T,
  payload: JobPayloads[T],
  options: { runAt?: Date; maxAttempts?: number } = {},
): Promise<string> {
  const job = await db.job.create({
    data: {
      type,
      payload,
      runAt: options.runAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 3,
    },
    select: { id: true, runAt: true },
  });
  await notifyWorkers(job.id, job.runAt, 1);
  return job.id;
}

/** Takes one specific job if it is due and still queued (BullMQ delivery). */
export async function claimJob(id: string, workerId: string): Promise<ClaimedJob | null> {
  const now = new Date();
  const rows = await db.$queryRaw<ClaimRow[]>(Prisma.sql`
    UPDATE "jobs"
    SET "status" = 'RUNNING'::"JobStatus",
        "attempts" = "attempts" + 1,
        "locked_at" = ${now},
        "locked_by" = ${workerId},
        "updated_at" = ${now}
    WHERE "id" = ${id} AND "status" = 'QUEUED'::"JobStatus" AND "run_at" <= ${now}
    RETURNING "id", "type", "payload", "attempts", "max_attempts"`);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    type: row.type as JobType,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

type ClaimRow = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
};

/** Atomically takes the next due job, or returns null when there is none. */
export async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  // Prisma stores DateTime as UTC in columns without a time zone, so compare against the app's
  // clock (sent as UTC) rather than Postgres now(), which follows the session time zone.
  const now = new Date();
  const rows = await db.$queryRaw<ClaimRow[]>(Prisma.sql`
    UPDATE "jobs"
    SET "status" = 'RUNNING'::"JobStatus",
        "attempts" = "attempts" + 1,
        "locked_at" = ${now},
        "locked_by" = ${workerId},
        "updated_at" = ${now}
    WHERE "id" = (
      SELECT "id" FROM "jobs"
      WHERE "status" = 'QUEUED'::"JobStatus" AND "run_at" <= ${now}
      ORDER BY "run_at", "created_at"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "type", "payload", "attempts", "max_attempts"`);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    type: row.type as JobType,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

export async function completeJob(id: string): Promise<void> {
  await db.job.update({
    where: { id },
    data: { status: "DONE", finishedAt: new Date(), lockedAt: null, lockedBy: null },
  });
}

/** Schedules a retry with backoff, or marks the job failed after its last attempt. */
export async function failJob(job: ClaimedJob, error: unknown): Promise<"retry" | "failed"> {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  const retry = job.attempts < job.maxAttempts;
  const runAt = new Date(Date.now() + backoffMs(job.attempts));
  await db.job.update({
    where: { id: job.id },
    data: {
      status: retry ? "QUEUED" : "FAILED",
      runAt: retry ? runAt : undefined,
      finishedAt: retry ? null : new Date(),
      lastError: message.slice(0, 4000),
      lockedAt: null,
      lockedBy: null,
    },
  });
  if (retry) await notifyWorkers(job.id, runAt, job.attempts + 1);
  return retry ? "retry" : "failed";
}

/** Requeues jobs left RUNNING by a worker that crashed. Returns how many were requeued. */
export async function requeueStaleJobs(now = new Date()): Promise<number> {
  const result = await db.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    data: { status: "QUEUED", lockedAt: null, lockedBy: null },
  });
  return result.count;
}
