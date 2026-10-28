import "server-only";

import { db } from "@/server/db";

export type Limit = { key: string; limit: number; windowSeconds: number };
export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Fixed-window counter in PostgreSQL, so every app server shares it (D-043). Counts the hit
 * and says whether it is within the limit. Old windows are cleaned up opportunistically.
 */
export async function hit(
  { key, limit, windowSeconds }: Limit,
  now = new Date(),
): Promise<LimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const row = await db.rateLimit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (Math.random() < 0.01) {
    await db.rateLimit.deleteMany({
      where: { windowStart: { lt: new Date(now.getTime() - 2 * 86_400_000) } },
    });
  }
  if (row.count <= limit) return { ok: true };
  return {
    ok: false,
    retryAfterSeconds: Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000),
  };
}

/** Checks several limits; the first one exceeded wins. Every limit is counted. */
export async function hitAll(limits: Limit[], now = new Date()): Promise<LimitResult> {
  let result: LimitResult = { ok: true };
  for (const limit of limits) {
    const r = await hit(limit, now);
    if (!r.ok && result.ok) result = r;
  }
  return result;
}

export function waitMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes > 1
    ? `Too many attempts. Try again in ${minutes} minutes.`
    : "Too many attempts. Try again in a minute.";
}
