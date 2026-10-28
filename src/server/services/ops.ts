import "server-only";

import { flagQuestion, MIN_ATTEMPTS_FOR_FLAGS, type QuestionFlag } from "@/lib/content/analytics";
import { db } from "@/server/db";
import { getJudge } from "@/server/integrations/judge";

// ---------- Jobs and judge ----------

export async function getJobOverview(now = new Date()) {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const [byStatus, oldestQueued, failed, verdicts, pendingSubmissions, runtime] = await Promise.all(
    [
      db.job.groupBy({ by: ["type", "status"], _count: { _all: true } }),
      db.job.findFirst({
        where: { status: "QUEUED", runAt: { lte: now } },
        orderBy: { runAt: "asc" },
        select: { runAt: true, type: true },
      }),
      db.job.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          attempts: true,
          lastError: true,
          updatedAt: true,
          payload: true,
        },
      }),
      db.submission.groupBy({
        by: ["verdict"],
        where: { createdAt: { gte: dayAgo } },
        _count: { _all: true },
      }),
      db.submission.count({ where: { verdict: { in: ["PENDING", "RUNNING"] } } }),
      db.submission.aggregate({
        where: { createdAt: { gte: dayAgo }, finishedAt: { not: null } },
        _avg: { runtimeMs: true },
        _count: { _all: true },
      }),
    ],
  );

  const types = [...new Set(byStatus.map((r) => r.type))].sort();
  const table = types.map((type) => {
    const count = (status: string) =>
      byStatus.find((r) => r.type === type && r.status === status)?._count._all ?? 0;
    return {
      type,
      queued: count("QUEUED"),
      running: count("RUNNING"),
      done: count("DONE"),
      failed: count("FAILED"),
    };
  });
  let judgeName = "unavailable";
  try {
    judgeName = getJudge().name;
  } catch (error) {
    judgeName = error instanceof Error ? error.message : "unavailable";
  }
  return {
    table,
    backlogSeconds: oldestQueued
      ? Math.round((now.getTime() - oldestQueued.runAt.getTime()) / 1000)
      : 0,
    failed,
    judge: {
      name: judgeName,
      pending: pendingSubmissions,
      last24h: runtime._count._all,
      avgRuntimeMs: runtime._avg.runtimeMs ? Math.round(runtime._avg.runtimeMs) : null,
      verdicts: verdicts
        .map((v) => ({ verdict: v.verdict, count: v._count._all }))
        .sort((a, b) => b.count - a.count),
    },
  };
}

/** Puts a failed job back in the queue. */
export async function retryJob(id: string) {
  await db.job.updateMany({
    where: { id, status: "FAILED" },
    data: {
      status: "QUEUED",
      attempts: 0,
      runAt: new Date(),
      lastError: null,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

// ---------- Content analytics ----------

export type QuestionAnalytics = {
  id: string;
  externalId: string;
  text: string;
  topic: string;
  attempts: number;
  accuracy: number;
  medianTimeSec: number;
  expectedTimeSec: number;
  optionShares: { letter: string; share: number; correct: boolean }[];
  flags: QuestionFlag[];
};

export async function getQuestionAnalytics({
  flaggedOnly,
  minAttempts = 5,
  take = 100,
}: {
  flaggedOnly: boolean;
  minAttempts?: number;
  take?: number;
}): Promise<{ rows: QuestionAnalytics[]; flagged: number; measured: number }> {
  const totals = await db.$queryRaw<
    { question_id: string; total: bigint; correct: bigint; median: number }[]
  >`
    SELECT question_id,
           count(*) AS total,
           sum(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY time_sec) AS median
    FROM attempts
    GROUP BY question_id
    HAVING count(*) >= ${minAttempts}`;
  if (!totals.length) return { rows: [], flagged: 0, measured: 0 };

  const ids = totals.map((t) => t.question_id);
  const [questions, options] = await Promise.all([
    db.question.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        externalId: true,
        text: true,
        type: true,
        options: true,
        correctOptions: true,
        expectedTimeSec: true,
        topic: { select: { name: true } },
      },
    }),
    db.$queryRaw<{ question_id: string; letter: string; picks: bigint }[]>`
      SELECT question_id, unnest(selected_options) AS letter, count(*) AS picks
      FROM attempts
      WHERE question_id = ANY(${ids})
      GROUP BY 1, 2`,
  ]);

  const rows = questions.map((q): QuestionAnalytics => {
    const t = totals.find((x) => x.question_id === q.id)!;
    const attempts = Number(t.total);
    const optionCounts = Object.fromEntries(
      options.filter((o) => o.question_id === q.id).map((o) => [o.letter, Number(o.picks)]),
    );
    const letters = q.options.map((_, i) => String.fromCharCode(65 + i));
    return {
      id: q.id,
      externalId: q.externalId,
      text: q.text,
      topic: q.topic.name,
      attempts,
      accuracy: Number(t.correct) / attempts,
      medianTimeSec: Math.round(Number(t.median)),
      expectedTimeSec: q.expectedTimeSec,
      optionShares: letters.map((letter) => ({
        letter,
        share: (optionCounts[letter] ?? 0) / attempts,
        correct: q.correctOptions.includes(letter),
      })),
      flags:
        q.type === "NUMERIC"
          ? flagQuestion({
              attempts,
              correct: Number(t.correct),
              medianTimeSec: Number(t.median),
              expectedTimeSec: q.expectedTimeSec,
              correctOptions: [],
              optionCounts: {},
            })
          : flagQuestion({
              attempts,
              correct: Number(t.correct),
              medianTimeSec: Number(t.median),
              expectedTimeSec: q.expectedTimeSec,
              correctOptions: q.correctOptions,
              optionCounts,
            }),
    };
  });
  const flagged = rows.filter((r) => r.flags.length);
  const sorted = (flaggedOnly ? flagged : rows).sort(
    (a, b) => b.flags.length - a.flags.length || a.accuracy - b.accuracy,
  );
  return {
    rows: sorted.slice(0, take),
    flagged: flagged.length,
    measured: rows.filter((r) => r.attempts >= MIN_ATTEMPTS_FOR_FLAGS).length,
  };
}
