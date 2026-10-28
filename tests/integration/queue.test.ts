import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { claimNextJob, enqueueJob, failJob, requeueStaleJobs } from "@/server/jobs/queue";
import { runJob } from "@/server/jobs/runner";
import { resetDatabase } from "./helpers";

beforeEach(resetDatabase);

describe("Postgres job queue", () => {
  it("never hands the same job to two workers", async () => {
    for (let i = 0; i < 5; i++) await enqueueJob("import.validate", { batchId: `b${i}` });

    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, i) => claimNextJob(`worker-${i}`)),
    );
    const ids = claims.filter((c) => c !== null).map((c) => c!.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it("retries a failed job later, then gives up after the last attempt", async () => {
    await enqueueJob("import.validate", { batchId: "x" }, { maxAttempts: 2 });

    const first = (await claimNextJob("w"))!;
    expect(await failJob(first, new Error("boom"))).toBe("retry");
    const queued = await db.job.findUniqueOrThrow({ where: { id: first.id } });
    expect(queued.status).toBe("QUEUED");
    expect(queued.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(await claimNextJob("w")).toBeNull(); // not due yet

    await db.job.update({ where: { id: first.id }, data: { runAt: new Date() } });
    const second = (await claimNextJob("w"))!;
    expect(second.attempts).toBe(2);
    expect(await failJob(second, new Error("boom again"))).toBe("failed");
    expect(await db.job.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
      status: "FAILED",
      lastError: expect.stringContaining("boom again"),
    });
  });

  it("requeues jobs left running by a crashed worker", async () => {
    await enqueueJob("import.validate", { batchId: "x" });
    const job = (await claimNextJob("dead-worker"))!;
    await db.job.update({
      where: { id: job.id },
      data: { lockedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    expect(await requeueStaleJobs()).toBe(1);
    expect(await claimNextJob("new-worker")).toMatchObject({ id: job.id, attempts: 2 });
  });

  it("completes a job whose handler succeeds", async () => {
    // A validate job for a missing batch is a no-op, so it succeeds.
    await enqueueJob("import.validate", { batchId: "missing" });
    const job = (await claimNextJob("w"))!;
    expect(await runJob(job)).toBe("done");
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("DONE");
  });
});
