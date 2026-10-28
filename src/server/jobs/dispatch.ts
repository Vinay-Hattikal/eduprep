// How workers hear about jobs (D-029, D-046). The PostgreSQL `jobs` table is always the record
// (status, attempts, errors, admin monitor, retries). The dispatcher only decides how fast a
// worker picks a job up:
//   postgres  workers poll the table every second (no extra service)
//   bullmq    the job id is pushed to Redis (BullMQ) with its delay, so a worker starts it at
//             once and many workers share the load. If Redis loses anything, the slower table
//             sweep still runs every due job.

import { env } from "@/server/env";

export const BULLMQ_QUEUE = "jobs";

export interface Dispatcher {
  readonly name: "postgres" | "bullmq";
  dispatch(jobId: string, runAt: Date, attempt: number): Promise<void>;
  close(): Promise<void>;
}

const postgres: Dispatcher = {
  name: "postgres",
  async dispatch() {},
  async close() {},
};

/** Redis connection options for BullMQ from a redis:// or rediss:// URL. */
export function redisConnection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

async function createBullDispatcher(url: string): Promise<Dispatcher> {
  const { Queue } = await import("bullmq");
  const queue = new Queue(BULLMQ_QUEUE, { connection: redisConnection(url) });
  return {
    name: "bullmq",
    async dispatch(jobId, runAt, attempt) {
      await queue.add(
        "job",
        { jobId },
        {
          // One BullMQ entry per attempt; the database row decides whether it still runs.
          jobId: `${jobId}-${attempt}`,
          delay: Math.max(0, runAt.getTime() - Date.now()),
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );
    },
    close: () => queue.close(),
  };
}

let dispatcher: Promise<Dispatcher> | null = null;

export function getDispatcher(): Promise<Dispatcher> {
  if (!dispatcher) {
    const config = env();
    dispatcher =
      config.QUEUE_DRIVER === "bullmq"
        ? createBullDispatcher(config.REDIS_URL!)
        : Promise.resolve(postgres);
  }
  return dispatcher;
}

/** Tells workers about a job. A failure here never loses the job: the table sweep finds it. */
export async function notifyWorkers(jobId: string, runAt: Date, attempt: number) {
  try {
    await (await getDispatcher()).dispatch(jobId, runAt, attempt);
  } catch (error) {
    console.error(`[queue] couldn't dispatch ${jobId}; the sweep will pick it up`, error);
  }
}
