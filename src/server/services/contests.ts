import "server-only";

// All-India mock tests (D-049). A contest is a scheduled test with one frozen question set: every
// student gets the same questions (each in their own order), takes it once, and is ranked against
// everyone. Ranks are live while the contest runs and frozen when results are final.

import { Prisma } from "@/generated/prisma/client";
import type { SectionType } from "@/generated/prisma/enums";
import { contestBadges } from "@/lib/engagement/badges";
import {
  contestPhase,
  rankSittings,
  resultsAt,
  type ContestPhase,
  type ContestTimes,
} from "@/lib/contests/ranking";
import { publicName } from "@/lib/format";
import { GRACE_MS, maxEnd } from "@/lib/tests/clock";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { enqueueJob } from "@/server/jobs/queue";
import { recordAudit } from "@/server/services/audit";
import { awardBadges } from "@/server/services/engagement";
import { notify } from "@/server/services/notifications";
import { drawItems, finishSitting, shuffle, type SectionSnapshot } from "@/server/services/tests";

type Viewer = Pick<CurrentUser, "id">;

function timesOf(contest: { startsAt: Date; endsAt: Date; sections: Prisma.JsonValue }) {
  const sections = contest.sections as SectionSnapshot[];
  return {
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    durationMinutes: sections.reduce((sum, s) => sum + s.minutes, 0),
  } satisfies ContestTimes;
}

export type ContestSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  resultsAt: Date;
  phase: ContestPhase;
  durationMinutes: number;
  items: number;
  sections: { name: string; type: SectionType; minutes: number }[];
  participants: number;
  mine: {
    sittingId: string;
    status: "IN_PROGRESS" | "SUBMITTED";
    score: number | null;
    maxScore: number | null;
    finalRank: number | null;
    finalPercentile: number | null;
  } | null;
};

const summarySelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  sections: true,
  _count: { select: { items: true } },
} satisfies Prisma.ContestSelect;

async function summarize(
  contests: Prisma.ContestGetPayload<{ select: typeof summarySelect }>[],
  userId: string | null,
  now: Date,
): Promise<ContestSummary[]> {
  if (!contests.length) return [];
  const ids = contests.map((c) => c.id);
  const [counts, mine] = await Promise.all([
    db.testSitting.groupBy({
      by: ["contestId"],
      where: { contestId: { in: ids }, status: "SUBMITTED" },
      _count: { _all: true },
    }),
    userId
      ? db.testSitting.findMany({
          where: { contestId: { in: ids }, userId },
          select: {
            id: true,
            contestId: true,
            status: true,
            score: true,
            maxScore: true,
            finalRank: true,
            finalPercentile: true,
          },
        })
      : [],
  ]);
  return contests.map((contest) => {
    const times = timesOf(contest);
    const sitting = mine.find((s) => s.contestId === contest.id);
    return {
      id: contest.id,
      slug: contest.slug,
      title: contest.title,
      description: contest.description,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      resultsAt: resultsAt(times),
      phase: contestPhase(times, now),
      durationMinutes: times.durationMinutes,
      items: contest._count.items,
      sections: (contest.sections as SectionSnapshot[]).map((s) => ({
        name: s.name,
        type: s.type,
        minutes: s.minutes,
      })),
      participants: counts.find((c) => c.contestId === contest.id)?._count._all ?? 0,
      mine: sitting
        ? {
            sittingId: sitting.id,
            status: sitting.status,
            score: sitting.score,
            maxScore: sitting.maxScore,
            finalRank: sitting.finalRank,
            finalPercentile: sitting.finalPercentile,
          }
        : null,
    };
  });
}

/** Upcoming and live contests (soonest first) and recent past ones. */
export async function listContests(userId: string | null, now = new Date()) {
  const [current, past] = await Promise.all([
    db.contest.findMany({
      where: { status: "PUBLISHED", endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 10,
      select: summarySelect,
    }),
    db.contest.findMany({
      where: { status: "PUBLISHED", endsAt: { lt: now } },
      orderBy: { startsAt: "desc" },
      take: 20,
      select: summarySelect,
    }),
  ]);
  return {
    current: await summarize(current, userId, now),
    past: await summarize(past, userId, now),
  };
}

/** The next contest to show on the dashboard and tests page: live first, else upcoming. */
export async function featuredContest(userId: string, now = new Date()) {
  const { current } = await listContests(userId, now);
  return current.find((c) => c.phase === "live") ?? current[0] ?? null;
}

export async function getContest(slug: string, userId: string | null, now = new Date()) {
  const contest = await db.contest.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: summarySelect,
  });
  if (!contest) return null;
  return (await summarize([contest], userId, now))[0]!;
}

// ---------- Taking part ----------

export type ContestStart =
  | { status: "started"; sittingId: string }
  | { status: "finished"; sittingId: string }
  | { status: "not-open"; message: string }
  | { status: "not-found" };

export async function startContestSitting(
  user: Viewer,
  slug: string,
  now = new Date(),
  random: () => number = Math.random,
): Promise<ContestStart> {
  const contest = await db.contest.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: { items: true },
  });
  if (!contest) return { status: "not-found" };

  const existing = await db.testSitting.findUnique({
    where: { contestId_userId: { contestId: contest.id, userId: user.id } },
    select: { id: true, status: true },
  });
  if (existing)
    return {
      status: existing.status === "SUBMITTED" ? "finished" : "started",
      sittingId: existing.id,
    };

  const phase = contestPhase(timesOf(contest), now);
  if (phase === "upcoming") return { status: "not-open", message: "This test hasn't opened yet." };
  if (phase !== "live")
    return { status: "not-open", message: "This test has closed. Watch for next week's." };

  const sections = contest.sections as SectionSnapshot[];
  const endsAt = maxEnd(now, sections);
  // Same questions for everyone; each student gets them in their own order.
  const items = sections.flatMap((_, sectionIndex) =>
    shuffle(
      contest.items.filter((i) => i.sectionIndex === sectionIndex),
      random,
    ).map((item, position) => ({
      sectionIndex,
      position,
      questionId: item.questionId,
      problemId: item.problemId,
    })),
  );

  let sittingId: string;
  try {
    sittingId = await db.$transaction(async (tx) => {
      const sitting = await tx.testSitting.create({
        data: {
          userId: user.id,
          blueprintId: contest.blueprintId,
          contestId: contest.id,
          startedAt: now,
          sections,
          endsAt,
        },
        select: { id: true },
      });
      await tx.sittingItem.createMany({
        data: items.map((item) => ({ ...item, sittingId: sitting.id })),
      });
      return sitting.id;
    });
  } catch (error) {
    // Two starts at once: the unique (contest, user) key lets only one through.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await db.testSitting.findUniqueOrThrow({
        where: { contestId_userId: { contestId: contest.id, userId: user.id } },
        select: { id: true },
      });
      return { status: "started", sittingId: winner.id };
    }
    throw error;
  }
  await enqueueJob(
    "test.autosubmit",
    { sittingId },
    { runAt: new Date(endsAt.getTime() + GRACE_MS), maxAttempts: 5 },
  );
  return { status: "started", sittingId };
}

// ---------- Ranks ----------

export type LeaderboardRow = {
  sittingId: string;
  userId: string;
  name: string;
  score: number;
  maxScore: number;
  timeSec: number;
  rank: number;
};

// Time taken in whole seconds; ranking ties on equal score and equal time.
const TIME_SQL = Prisma.sql`FLOOR(EXTRACT(EPOCH FROM (s.submitted_at - s.started_at)))::int`;

/** Live ranks over every submitted sitting: higher score, then less time (D-049). */
export async function leaderboard(contestId: string, take = 50): Promise<LeaderboardRow[]> {
  const rows = await db.$queryRaw<
    {
      sitting_id: string;
      user_id: string;
      name: string;
      score: number;
      max_score: number;
      time_sec: number;
      rank: bigint;
    }[]
  >`
    SELECT s.id AS sitting_id, s.user_id, u.name, s.score, s.max_score,
           ${TIME_SQL} AS time_sec,
           RANK() OVER (ORDER BY s.score DESC, ${TIME_SQL} ASC) AS rank
    FROM test_sittings s
    JOIN users u ON u.id = s.user_id
    WHERE s.contest_id = ${contestId} AND s.status = 'SUBMITTED' AND s.score IS NOT NULL
    ORDER BY rank, s.submitted_at
    LIMIT ${take}`;
  return rows.map((r) => ({
    sittingId: r.sitting_id,
    userId: r.user_id,
    name: publicName(r.name),
    score: r.score,
    maxScore: r.max_score,
    timeSec: r.time_sec,
    rank: Number(r.rank),
  }));
}

export type Standing = { rank: number; total: number; percentile: number; final: boolean };

/** One student's rank and percentile: frozen once final, otherwise live. */
export async function standing(contestId: string, userId: string): Promise<Standing | null> {
  const sitting = await db.testSitting.findUnique({
    where: { contestId_userId: { contestId, userId } },
    select: {
      id: true,
      status: true,
      score: true,
      finalRank: true,
      finalPercentile: true,
      contest: { select: { finalizedAt: true } },
    },
  });
  if (!sitting || sitting.status !== "SUBMITTED" || sitting.score === null) return null;
  const total = await db.testSitting.count({
    where: { contestId, status: "SUBMITTED", score: { not: null } },
  });
  if (sitting.contest?.finalizedAt && sitting.finalRank !== null) {
    return {
      rank: sitting.finalRank,
      total,
      percentile: sitting.finalPercentile ?? 0,
      final: true,
    };
  }
  const [row] = await db.$queryRaw<{ better: bigint; at_or_below: bigint }[]>`
    WITH me AS (
      SELECT s.score, ${TIME_SQL} AS time_sec FROM test_sittings s WHERE s.id = ${sitting.id}
    )
    SELECT
      COUNT(*) FILTER (WHERE s.score > me.score
                          OR (s.score = me.score AND ${TIME_SQL} < me.time_sec)) AS better,
      COUNT(*) FILTER (WHERE s.score <= me.score) AS at_or_below
    FROM test_sittings s, me
    WHERE s.contest_id = ${contestId} AND s.status = 'SUBMITTED' AND s.score IS NOT NULL`;
  return {
    rank: Number(row!.better) + 1,
    total,
    percentile: Math.round((Number(row!.at_or_below) / total) * 10_000) / 100,
    final: false,
  };
}

/**
 * Job "contest.finalize": once every sitting must be over, submits any stragglers, freezes ranks
 * and percentiles, awards badges and tells every participant. Safe to run twice.
 */
export async function finalizeContest(contestId: string, now = new Date()): Promise<void> {
  const contest = await db.contest.findUnique({ where: { id: contestId } });
  if (!contest || contest.status !== "PUBLISHED" || contest.finalizedAt) return;
  const times = timesOf(contest);
  if (contestPhase(times, now) !== "final") {
    await enqueueJob("contest.finalize", { contestId }, { runAt: resultsAt(times) });
    return;
  }

  const stragglers = await db.testSitting.findMany({
    where: { contestId, status: "IN_PROGRESS" },
    select: { id: true },
  });
  for (const sitting of stragglers) await finishSitting(sitting.id, { auto: true, now });

  const sittings = await db.testSitting.findMany({
    where: { contestId, status: "SUBMITTED", score: { not: null } },
    select: {
      id: true,
      userId: true,
      score: true,
      startedAt: true,
      submittedAt: true,
      user: { select: { name: true } },
    },
  });
  const ranked = rankSittings(
    sittings.map((s) => ({
      ...s,
      score: s.score!,
      submittedAt: s.submittedAt ?? s.startedAt,
      timeSec: Math.floor(
        ((s.submittedAt ?? s.startedAt).getTime() - s.startedAt.getTime()) / 1000,
      ),
    })),
  );

  // Claim, ranks and badges commit together: a second run (or worker) finds it claimed.
  const claimed = await db.$transaction(
    async (tx) => {
      const claim = await tx.contest.updateMany({
        where: { id: contestId, finalizedAt: null },
        data: { finalizedAt: now },
      });
      if (claim.count === 0) return false;
      for (let i = 0; i < ranked.length; i += 1000) {
        const chunk = ranked.slice(i, i + 1000);
        await tx.$executeRaw`
          UPDATE test_sittings AS s
          SET final_rank = v.rank, final_percentile = v.percentile
          FROM (VALUES ${Prisma.join(
            chunk.map((r) => Prisma.sql`(${r.id}, ${r.rank}::int, ${r.percentile}::float8)`),
          )}) AS v(id, rank, percentile)
          WHERE s.id = v.id`;
      }
      for (const row of ranked) await awardBadges(tx, row.userId, contestBadges(row.percentile));
      return true;
    },
    { timeout: 120_000 },
  );
  if (!claimed) return;

  for (const row of ranked) {
    await notify(row.userId, "contest.result", {
      name: row.user.name.split(" ")[0] ?? row.user.name,
      contest: contest.title,
      slug: contest.slug,
      rank: row.rank,
      total: ranked.length,
      percentile: row.percentile,
    });
  }
}

/** Solutions and answers of a contest sitting stay hidden until the results are final. */
export async function contestSolutionsOpen(contestId: string, now = new Date()) {
  const contest = await db.contest.findUnique({
    where: { id: contestId },
    select: { startsAt: true, endsAt: true, sections: true, finalizedAt: true },
  });
  if (!contest) return { open: true, at: null };
  const at = resultsAt(timesOf(contest));
  return { open: contest.finalizedAt !== null || now >= at, at };
}

// ---------- Admin ----------

export type ContestInput = {
  id?: string;
  slug: string;
  title: string;
  description: string | null;
  blueprintId: string;
  startsAt: Date;
  endsAt: Date;
};

export async function listContestsForAdmin() {
  const contests = await db.contest.findMany({
    orderBy: { startsAt: "desc" },
    take: 100,
    include: {
      blueprint: { select: { title: true } },
      _count: { select: { sittings: true, items: true } },
    },
  });
  return contests.map((c) => ({ ...c, phase: contestPhase(timesOf(c), new Date()) }));
}

export async function getContestForAdmin(id: string) {
  return db.contest.findUnique({
    where: { id },
    include: {
      blueprint: { select: { id: true, title: true, slug: true } },
      _count: { select: { sittings: true, items: true } },
    },
  });
}

export type SaveContestResult =
  | { ok: true; id: string }
  | { ok: false; fieldErrors?: Record<string, string>; formError?: string };

export async function saveContest(input: ContestInput, actor: Viewer): Promise<SaveContestResult> {
  if (input.endsAt <= input.startsAt)
    return { ok: false, fieldErrors: { endsAt: "Must be after the start." } };
  const blueprint = await db.testBlueprint.findUnique({
    where: { id: input.blueprintId },
    select: { id: true },
  });
  if (!blueprint) return { ok: false, fieldErrors: { blueprintId: "Choose a test format." } };
  const clash = await db.contest.findFirst({
    where: { slug: input.slug, ...(input.id && { id: { not: input.id } }) },
    select: { id: true },
  });
  if (clash) return { ok: false, fieldErrors: { slug: "Another contest uses this slug." } };

  const { id, ...data } = input;
  if (id) {
    const before = await db.contest.findUnique({ where: { id } });
    if (!before) return { ok: false, formError: "This contest no longer exists." };
    if (before.status !== "DRAFT")
      return { ok: false, formError: "Published contests can't be edited. Unpublish it first." };
    await db.contest.update({ where: { id }, data });
    await recordAudit({
      actorId: actor.id,
      action: "contest.update",
      entityType: "contest",
      entityId: id,
      after: { title: data.title, startsAt: data.startsAt, endsAt: data.endsAt },
    });
    return { ok: true, id };
  }
  const created = await db.contest.create({ data, select: { id: true } });
  await recordAudit({
    actorId: actor.id,
    action: "contest.create",
    entityType: "contest",
    entityId: created.id,
    after: { title: data.title, startsAt: data.startsAt },
  });
  return { ok: true, id: created.id };
}

/** Freezes the format and draws the question set; schedules the results. */
export async function publishContest(
  id: string,
  actor: Viewer,
  random: () => number = Math.random,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const contest = await db.contest.findUnique({
    where: { id },
    include: {
      blueprint: {
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: { rules: { include: { topic: { select: { name: true } } } } },
          },
        },
      },
    },
  });
  if (!contest) return { ok: false, error: "Not found." };
  if (contest.status !== "DRAFT") return { ok: false, error: "Already published." };
  if (contest.endsAt <= new Date())
    return { ok: false, error: "This contest's window has passed." };
  if (!contest.blueprint.sections.length)
    return { ok: false, error: "The test format has no sections." };

  const sections: SectionSnapshot[] = contest.blueprint.sections.map((s) => ({
    name: s.name,
    type: s.type,
    minutes: s.minutes,
    marksPerItem: s.marksPerItem,
    negativeMarks: s.negativeMarks,
    canGoBack: s.canGoBack,
  }));
  const result = await db.$transaction(
    async (tx) => {
      const drawn = await drawItems(tx, contest.blueprint, null, random);
      if (!drawn.ok) return drawn;
      await tx.contestItem.deleteMany({ where: { contestId: id } });
      await tx.contestItem.createMany({
        data: drawn.items.map((item) => ({ ...item, contestId: id })),
      });
      await tx.contest.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          sections: sections as unknown as Prisma.InputJsonValue,
        },
      });
      await recordAudit(
        {
          actorId: actor.id,
          action: "contest.publish",
          entityType: "contest",
          entityId: id,
          after: { items: drawn.items.length },
        },
        tx,
      );
      return { ok: true as const };
    },
    { timeout: 20_000 },
  );
  if (!result.ok) return { ok: false, error: result.message };
  await enqueueJob(
    "contest.finalize",
    { contestId: id },
    {
      runAt: resultsAt({
        startsAt: contest.startsAt,
        endsAt: contest.endsAt,
        durationMinutes: sections.reduce((sum, s) => sum + s.minutes, 0),
      }),
      maxAttempts: 5,
    },
  );
  return { ok: true };
}

/** Back to draft, only while nobody has started it. */
export async function unpublishContest(
  id: string,
  actor: Viewer,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sittings = await db.testSitting.count({ where: { contestId: id } });
  if (sittings) return { ok: false, error: "Students have already taken this contest." };
  const updated = await db.contest.updateMany({
    where: { id, status: "PUBLISHED" },
    data: { status: "DRAFT", publishedAt: null },
  });
  if (!updated.count) return { ok: false, error: "Not published." };
  await db.contestItem.deleteMany({ where: { contestId: id } });
  await recordAudit({
    actorId: actor.id,
    action: "contest.unpublish",
    entityType: "contest",
    entityId: id,
  });
  return { ok: true };
}

/** A draft copy one week later: the weekly routine is "copy, check, publish". */
export async function copyContestToNextWeek(id: string, actor: Viewer) {
  const source = await db.contest.findUnique({ where: { id } });
  if (!source) return { ok: false as const, error: "Not found." };
  const week = 7 * 86_400_000;
  const startsAt = new Date(source.startsAt.getTime() + week);
  const base = source.slug.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  let slug = `${base}-${startsAt.toISOString().slice(0, 10)}`;
  if (await db.contest.findUnique({ where: { slug }, select: { id: true } }))
    slug = `${slug}-${Date.now().toString(36)}`;
  const result = await saveContest(
    {
      slug,
      title: source.title,
      description: source.description,
      blueprintId: source.blueprintId,
      startsAt,
      endsAt: new Date(source.endsAt.getTime() + week),
    },
    actor,
  );
  return result.ok
    ? { ok: true as const, id: result.id }
    : { ok: false as const, error: "Copy failed." };
}

/** Blueprints usable as a contest format, with their size for the picker. */
export async function contestFormatOptions() {
  const blueprints = await db.testBlueprint.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      sections: { select: { minutes: true, rules: { select: { count: true } } } },
    },
  });
  return blueprints.map((b) => ({
    id: b.id,
    title: b.title,
    minutes: b.sections.reduce((n, s) => n + s.minutes, 0),
    items: b.sections.reduce((n, s) => n + s.rules.reduce((m, r) => m + r.count, 0), 0),
  }));
}
