import "server-only";

// Streaks, streak freezes and badges (D-052). Every activity that counts for the streak goes
// through recordDailyActivity(), so practice, tests and the daily question behave the same.

import type { Prisma } from "@/generated/prisma/client";
import { BADGES, crossedStatBadges, isBadgeId, type BadgeId } from "@/lib/engagement/badges";
import { recordActivity, type FreezeRules, type StreakUpdate } from "@/lib/learning/streak";
import { db } from "@/server/db";
import { getSetting } from "@/server/services/settings";

type Client = Prisma.TransactionClient | typeof db;

export async function freezeRules(): Promise<FreezeRules> {
  const [earnEvery, maxFreezes] = await Promise.all([
    getSetting("streak.freezeEveryDays"),
    getSetting("streak.maxFreezes"),
  ]);
  return { earnEvery, maxFreezes };
}

/**
 * Counts answers for today: updates the streak (using freezes for missed days), totals and any
 * badge whose threshold was just crossed. Call inside the transaction that records the answers.
 */
export async function recordDailyActivity(
  tx: Prisma.TransactionClient,
  userId: string,
  today: Date,
  counts: { attempts: number; correct: number },
  rules: FreezeRules,
): Promise<StreakUpdate> {
  const stats = await tx.userStats.findUnique({ where: { userId } });
  const streak = recordActivity(
    {
      currentStreak: stats?.currentStreak ?? 0,
      longestStreak: stats?.longestStreak ?? 0,
      lastActiveDate: stats?.lastActiveDate ?? null,
      streakFreezes: stats?.streakFreezes ?? 0,
    },
    today,
    rules,
  );
  const data = {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastActiveDate: streak.lastActiveDate,
    streakFreezes: streak.streakFreezes,
    ...(streak.frozeDays > 0 && { lastFreezeOn: streak.lastFreezeOn }),
  };
  await tx.userStats.upsert({
    where: { userId },
    create: {
      userId,
      ...data,
      freezesUsed: streak.frozeDays,
      totalAttempts: counts.attempts,
      totalCorrect: counts.correct,
    },
    update: {
      ...data,
      freezesUsed: { increment: streak.frozeDays },
      totalAttempts: { increment: counts.attempts },
      totalCorrect: { increment: counts.correct },
    },
  });

  const crossed = crossedStatBadges(
    { longestStreak: stats?.longestStreak ?? 0, totalAttempts: stats?.totalAttempts ?? 0 },
    {
      longestStreak: streak.longestStreak,
      totalAttempts: (stats?.totalAttempts ?? 0) + counts.attempts,
    },
  );
  if (crossed.length) await awardBadges(tx, userId, crossed);
  return streak;
}

/** Awards badges the user doesn't have yet. Returns the newly earned ones. */
export async function awardBadges(
  client: Client,
  userId: string,
  badges: readonly BadgeId[],
): Promise<BadgeId[]> {
  if (!badges.length) return [];
  const existing = await client.userBadge.findMany({
    where: { userId, badge: { in: [...badges] } },
    select: { badge: true },
  });
  const have = new Set(existing.map((b) => b.badge));
  const fresh = [...new Set(badges)].filter((b) => !have.has(b));
  if (fresh.length) {
    await client.userBadge.createMany({
      data: fresh.map((badge) => ({ userId, badge })),
      skipDuplicates: true,
    });
  }
  return fresh;
}

export type EarnedBadge = {
  id: BadgeId;
  name: string;
  description: string;
  tier: 1 | 2 | 3;
  earnedAt: Date;
  seen: boolean;
};

export async function listBadges(userId: string): Promise<EarnedBadge[]> {
  const rows = await db.userBadge.findMany({
    where: { userId },
    orderBy: { earnedAt: "desc" },
  });
  return rows
    .filter((row) => isBadgeId(row.badge))
    .map((row) => {
      const id = row.badge as BadgeId;
      return {
        id,
        name: BADGES[id].name,
        description: BADGES[id].description,
        tier: BADGES[id].tier,
        earnedAt: row.earnedAt,
        seen: row.seenAt !== null,
      };
    });
}

export async function markBadgesSeen(userId: string): Promise<void> {
  await db.userBadge.updateMany({
    where: { userId, seenAt: null },
    data: { seenAt: new Date() },
  });
}

export type FreezePurchase =
  { ok: true; freezes: number; points: number } | { ok: false; error: string };

/** Spends points on one streak freeze, if buying is on and the student has room for one. */
export async function buyStreakFreeze(userId: string): Promise<FreezePurchase> {
  const [cost, rules] = await Promise.all([getSetting("streak.freezePointsCost"), freezeRules()]);
  if (cost === 0 || rules.maxFreezes === 0)
    return { ok: false, error: "Streak freezes can't be bought right now." };

  // One conditional update: never overspends or overfills, even with two clicks at once.
  const updated = await db.userStats.updateMany({
    where: { userId, points: { gte: cost }, streakFreezes: { lt: rules.maxFreezes } },
    data: { points: { decrement: cost }, streakFreezes: { increment: 1 } },
  });
  const stats = await db.userStats.findUnique({ where: { userId } });
  if (updated.count === 0) {
    if ((stats?.streakFreezes ?? 0) >= rules.maxFreezes)
      return { ok: false, error: `You already hold ${rules.maxFreezes}, the most you can.` };
    return {
      ok: false,
      error: `A freeze costs ${cost} points; you have ${stats?.points ?? 0}.`,
    };
  }
  return { ok: true, freezes: stats!.streakFreezes, points: stats!.points };
}
