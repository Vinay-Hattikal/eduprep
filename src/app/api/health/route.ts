// Health check for load balancers, Docker and uptime monitors (D-047).
//   GET /api/health  → 200 { ok: true, … } when the database (and Redis, if used) answer.
// It reveals no versions or secrets.

import { connection, NextResponse } from "next/server";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { redisConnection } from "@/server/jobs/dispatch";

async function timed<T>(check: () => Promise<T>): Promise<{ ok: boolean; ms: number }> {
  const started = Date.now();
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  }
}

export async function GET() {
  await connection();
  const config = env();
  const database = await timed(() => db.$queryRaw`SELECT 1`);
  let redis: { ok: boolean; ms: number } | undefined;
  if (config.QUEUE_DRIVER === "bullmq") {
    redis = await timed(async () => {
      const { default: Redis } = await import("ioredis");
      const client = new Redis({
        ...redisConnection(config.REDIS_URL!),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      try {
        await client.connect();
        await client.ping();
      } finally {
        client.disconnect();
      }
    });
  }
  const ok = database.ok && (redis?.ok ?? true);
  return NextResponse.json(
    { ok, database, ...(redis && { redis }), time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
