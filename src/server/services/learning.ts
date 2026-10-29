import "server-only";

import { addDays, daysBetween, dayKey, istDay } from "@/lib/learning/dates";
import { computeReadiness, topicWeights } from "@/lib/learning/readiness";
import { streakSafeDays, visibleStreak } from "@/lib/learning/streak";
import { db } from "@/server/db";

export type TargetReadiness = {
  companyId: string;
  slug: string;
  name: string;
  targetDate: Date | null;
  daysLeft: number | null;
  score: number | null;
  focus: { topicSlug: string; topicName: string; mastery: number }[];
};

async function masteryMap(userId: string): Promise<Map<string, number>> {
  const rows = await db.mastery.findMany({
    where: { userId },
    select: { topicId: true, score: true },
  });
  return new Map(rows.map((r) => [r.topicId, r.score]));
}

/** Readiness for each of the student's target companies (PRD 4.7). */
export async function getTargetReadiness(
  userId: string,
  today = istDay(),
): Promise<TargetReadiness[]> {
  const targets = await db.targetCompany.findMany({
    where: { userId, company: { status: "PUBLISHED" } },
    orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }],
    include: {
      company: {
        select: {
          id: true,
          slug: true,
          name: true,
          rounds: {
            select: {
              // MCQ and coding sections: coding submissions build DSA topic mastery (D-060).
              sections: {
                select: {
                  minutes: true,
                  topics: { select: { id: true, slug: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const mastery = await masteryMap(userId);

  return targets.map((target) => {
    const sections = target.company.rounds.flatMap((r) => r.sections);
    const topics = new Map(sections.flatMap((s) => s.topics).map((t) => [t.id, t]));
    const readiness = computeReadiness(
      topicWeights(
        sections.map((s) => ({
          minutes: s.minutes,
          topicIds: s.topics.map((t) => t.id),
        })),
      ),
      mastery,
    );
    return {
      companyId: target.company.id,
      slug: target.company.slug,
      name: target.company.name,
      targetDate: target.targetDate,
      daysLeft: target.targetDate ? daysBetween(today, target.targetDate) : null,
      score: readiness.score,
      focus: readiness.focus.slice(0, 3).map((f) => ({
        topicSlug: topics.get(f.topicId)!.slug,
        topicName: topics.get(f.topicId)!.name,
        mastery: f.mastery,
      })),
    };
  });
}

export async function getStudentStats(userId: string, today = istDay()) {
  const [stats, todayCount, openMistakes, bookmarks] = await Promise.all([
    db.userStats.findUnique({ where: { userId } }),
    db.attempt.count({
      where: { userId, activityDate: today, mode: { in: ["PRACTICE", "RETRY"] } },
    }),
    db.mistake.count({ where: { userId, resolvedAt: null, question: { status: "PUBLISHED" } } }),
    db.bookmark.count({ where: { userId, question: { status: "PUBLISHED" } } }),
  ]);
  const attempts = stats?.totalAttempts ?? 0;
  const streakState = stats
    ? {
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        lastActiveDate: stats.lastActiveDate,
        streakFreezes: stats.streakFreezes,
      }
    : null;
  return {
    attempts,
    correct: stats?.totalCorrect ?? 0,
    accuracy: attempts >= 10 ? Math.round(((stats?.totalCorrect ?? 0) / attempts) * 100) : null,
    streak: streakState ? visibleStreak(streakState, today) : 0,
    streakFreezes: stats?.streakFreezes ?? 0,
    /** Missed days the student can still afford (freezes left), when the streak is alive. */
    streakSafeDays: streakState ? streakSafeDays(streakState, today) : null,
    /** A freeze saved the streak in the last week. */
    recentFreeze:
      stats?.lastFreezeOn && daysBetween(stats.lastFreezeOn, today) <= 7
        ? stats.lastFreezeOn
        : null,
    points: stats?.points ?? 0,
    longestStreak: stats?.longestStreak ?? 0,
    practisedToday: stats?.lastActiveDate ? dayKey(stats.lastActiveDate) === dayKey(today) : false,
    todayCount,
    openMistakes,
    bookmarks,
  };
}

export async function getRecentActivity(userId: string, take = 6) {
  return db.attempt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      isCorrect: true,
      createdAt: true,
      timeSec: true,
      question: { select: { externalId: true, topic: { select: { name: true, slug: true } } } },
    },
  });
}

/** Mastery for every topic the student has practised, grouped by subject. */
export async function getMasteryBySubject(userId: string) {
  const rows = await db.mastery.findMany({
    where: { userId },
    include: {
      topic: {
        select: {
          slug: true,
          name: true,
          subject: { select: { slug: true, name: true, order: true } },
        },
      },
    },
  });
  const subjects = new Map<
    string,
    {
      slug: string;
      name: string;
      order: number;
      topics: { slug: string; name: string; score: number; attempts: number; correct: number }[];
    }
  >();
  for (const row of rows) {
    const s = row.topic.subject;
    const entry = subjects.get(s.slug) ?? {
      slug: s.slug,
      name: s.name,
      order: s.order,
      topics: [],
    };
    entry.topics.push({
      slug: row.topic.slug,
      name: row.topic.name,
      score: row.score,
      attempts: row.attempts,
      correct: row.correct,
    });
    subjects.set(s.slug, entry);
  }
  return [...subjects.values()]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ ...s, topics: s.topics.sort((a, b) => a.score - b.score) }));
}

export type DailyPoint = {
  day: string;
  answered: number;
  correct: number;
  avgTimeSec: number | null;
};

/** Answers per IST day for the last `days` days, oldest first, with zero-filled gaps. */
export async function getDailySeries(
  userId: string,
  days = 30,
  today = istDay(),
): Promise<DailyPoint[]> {
  const from = addDays(today, -(days - 1));
  const rows = await db.attempt.groupBy({
    by: ["activityDate", "isCorrect"],
    where: { userId, activityDate: { gte: from } },
    _count: { _all: true },
    _sum: { timeSec: true },
  });
  const byDay = new Map<string, { answered: number; correct: number; time: number }>();
  for (const row of rows) {
    const key = dayKey(row.activityDate);
    const entry = byDay.get(key) ?? { answered: 0, correct: 0, time: 0 };
    entry.answered += row._count._all;
    entry.correct += row.isCorrect ? row._count._all : 0;
    entry.time += row._sum.timeSec ?? 0;
    byDay.set(key, entry);
  }
  return Array.from({ length: days }, (_, i) => {
    const key = dayKey(addDays(from, i));
    const entry = byDay.get(key);
    return {
      day: key,
      answered: entry?.answered ?? 0,
      correct: entry?.correct ?? 0,
      avgTimeSec: entry?.answered ? Math.round(entry.time / entry.answered) : null,
    };
  });
}

/** Replies from admins to the student's error reports. */
export async function getReportUpdates(userId: string, take = 3) {
  return db.errorReport.findMany({
    where: { userId, status: { not: "OPEN" }, reply: { not: null } },
    orderBy: { resolvedAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      reply: true,
      resolvedAt: true,
      question: { select: { externalId: true } },
    },
  });
}

/** Subjects → topics → subtopics with published question counts and the student's mastery. */
export async function getPracticeCatalog(userId: string) {
  const [subjects, counts, subtopicCounts, mastery] = await Promise.all([
    db.subject.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        slug: true,
        name: true,
        topics: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
          select: {
            id: true,
            slug: true,
            name: true,
            subtopics: {
              orderBy: [{ order: "asc" }, { name: "asc" }],
              select: { id: true, slug: true, name: true },
            },
          },
        },
      },
    }),
    db.question.groupBy({
      by: ["topicId"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    }),
    db.question.groupBy({
      by: ["subtopicId"],
      where: { status: "PUBLISHED", subtopicId: { not: null } },
      _count: { _all: true },
    }),
    db.mastery.findMany({
      where: { userId },
      select: { topicId: true, score: true, attempts: true },
    }),
  ]);
  const countByTopic = new Map(counts.map((c) => [c.topicId, c._count._all]));
  const countBySubtopic = new Map(subtopicCounts.map((c) => [c.subtopicId!, c._count._all]));
  const masteryByTopic = new Map(mastery.map((m) => [m.topicId, m]));

  return subjects.map((subject) => {
    const topics = subject.topics.map((topic) => ({
      slug: topic.slug,
      name: topic.name,
      questions: countByTopic.get(topic.id) ?? 0,
      mastery: masteryByTopic.get(topic.id)?.score ?? 0,
      attempts: masteryByTopic.get(topic.id)?.attempts ?? 0,
      subtopics: topic.subtopics
        .map((s) => ({ slug: s.slug, name: s.name, questions: countBySubtopic.get(s.id) ?? 0 }))
        .filter((s) => s.questions > 0),
    }));
    const practised = topics.filter((t) => t.attempts > 0);
    return {
      slug: subject.slug,
      name: subject.name,
      topics,
      questions: topics.reduce((sum, t) => sum + t.questions, 0),
      averageMastery: practised.length
        ? Math.round(practised.reduce((s, t) => s + t.mastery, 0) / practised.length)
        : null,
    };
  });
}
