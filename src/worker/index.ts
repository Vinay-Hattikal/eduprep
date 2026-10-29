// Background worker (D-029, D-046). Start with `npm run worker` (npm run dev starts it too).
//   QUEUE_DRIVER=postgres  polls the jobs table every second, one job at a time
//   QUEUE_DRIVER=bullmq    takes job ids from Redis as soon as they're due (WORKER_CONCURRENCY at
//                          once), and still sweeps the table every 15 s so nothing is missed

import { hostname } from "node:os";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { BULLMQ_QUEUE, getDispatcher, redisConnection } from "@/server/jobs/dispatch";
import { claimJob, claimNextJob, requeueStaleJobs } from "@/server/jobs/queue";
import { runJob } from "@/server/jobs/runner";
import { scheduleJobDigest } from "@/server/services/alerts";

const config = env();
const bull = config.QUEUE_DRIVER === "bullmq";
const POLL_MS = bull ? 15_000 : 1000;
const STALE_CHECK_MS = 60_000;
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 4);
const workerId = `${hostname()}:${process.pid}`;

let stopping = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message: string) {
  console.log(`[worker] ${new Date().toISOString()} ${message}`);
}

async function run(job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>) {
  const started = Date.now();
  log(`running ${job.type} ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);
  const result = await runJob(job);
  log(`${job.type} ${job.id}: ${result} in ${Date.now() - started} ms`);
}

/** The table sweep: the only loop with QUEUE_DRIVER=postgres, a safety net with bullmq. */
async function sweep() {
  let lastStaleCheck = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastStaleCheck > STALE_CHECK_MS) {
        const requeued = await requeueStaleJobs();
        if (requeued) log(`requeued ${requeued} stale job(s)`);
        lastStaleCheck = Date.now();
      }
      const job = await claimNextJob(workerId);
      if (!job) {
        await sleep(POLL_MS);
        continue;
      }
      await run(job);
    } catch (error) {
      log(`loop error: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(5000);
    }
  }
}

async function main() {
  log(`started as ${workerId} (${config.QUEUE_DRIVER})`);
  // The daily job-alert digest reschedules itself; this starts the chain the first time.
  await scheduleJobDigest().catch((error) => log(`couldn't schedule the job digest: ${error}`));
  let close = async () => {};
  if (bull) {
    const { Worker } = await import("bullmq");
    const worker = new Worker<{ jobId: string }>(
      BULLMQ_QUEUE,
      async (entry) => {
        const job = await claimJob(entry.data.jobId, workerId);
        if (job) await run(job); // null: already run, not due yet, or cancelled
      },
      { connection: redisConnection(config.REDIS_URL!), concurrency: CONCURRENCY },
    );
    worker.on("error", (error) => log(`redis error: ${error.message}`));
    close = async () => {
      await worker.close();
      await (await getDispatcher()).close();
    };
  }
  await sweep();
  await close();
  await db.$disconnect();
  log("stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    log(`${signal}: finishing current work, then stopping`);
    stopping = true;
  });
}

void main();
