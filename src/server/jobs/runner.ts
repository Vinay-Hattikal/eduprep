// Runs queued jobs: used by the worker process, scripts and integration tests.

import { commitBatch, validateBatch } from "@/server/imports/pipeline";
import { judgeSubmission, validateProblem } from "@/server/services/coding";
import { finalizeContest } from "@/server/services/contests";
import { scorecardOverdue, sendReminder, syncMeeting } from "@/server/services/interviews";
import { sendNotification } from "@/server/services/notifications";
import { autoSubmitSitting } from "@/server/services/tests";
import {
  claimNextJob,
  completeJob,
  failJob,
  type ClaimedJob,
  type JobPayloads,
  type JobType,
} from "@/server/jobs/queue";

const handlers: { [T in JobType]: (payload: JobPayloads[T]) => Promise<void> } = {
  "import.validate": ({ batchId }) => validateBatch(batchId),
  "import.commit": ({ batchId }) => commitBatch(batchId),
  "code.judge": ({ submissionId }) => judgeSubmission(submissionId),
  "problem.validate": ({ problemId }) => validateProblem(problemId),
  "test.autosubmit": ({ sittingId }) => autoSubmitSitting(sittingId),
  "notification.send": ({ notificationId }) => sendNotification(notificationId),
  "booking.meeting": ({ bookingId, action }) => syncMeeting(bookingId, action),
  "booking.reminder": ({ bookingId, when, startsAt }) => sendReminder(bookingId, when, startsAt),
  "scorecard.overdue": ({ bookingId, endsAt }) => scorecardOverdue(bookingId, endsAt),
  "contest.finalize": ({ contestId }) => finalizeContest(contestId),
};

export async function runJob(job: ClaimedJob): Promise<"done" | "retry" | "failed"> {
  const handler = handlers[job.type] as ((payload: unknown) => Promise<void>) | undefined;
  try {
    if (!handler) throw new Error(`No handler for job type "${job.type}"`);
    await handler(job.payload);
    await completeJob(job.id);
    return "done";
  } catch (error) {
    return failJob(job, error);
  }
}

/** Runs due jobs until none are left (scripts and tests). Returns how many ran. */
export async function drainJobs(workerId = "inline", limit = 1000): Promise<number> {
  let ran = 0;
  while (ran < limit) {
    const job = await claimNextJob(workerId);
    if (!job) return ran;
    await runJob(job);
    ran += 1;
  }
  return ran;
}
