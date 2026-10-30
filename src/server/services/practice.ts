import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { AttemptMode, Difficulty, ReportReason } from "@/generated/prisma/enums";
import { istDay } from "@/lib/learning/dates";
import { gradeAnswer } from "@/lib/learning/grading";
import { applyAnswer, EMPTY_MASTERY } from "@/lib/learning/mastery";
import { isPro, type Access } from "@/lib/commerce/access";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { getAccess, questionCovered } from "@/server/services/access";
import { freezeRules, recordDailyActivity } from "@/server/services/engagement";
import { getSetting } from "@/server/services/settings";

// ---------- What students may see before answering ----------

/** A question without its answer: safe to send to the browser before it's answered. */
export type StudentQuestion = {
  id: string;
  externalId: string;
  type: "SINGLE" | "MULTIPLE" | "NUMERIC";
  text: string;
  code: string | null;
  codeLanguage: string | null;
  options: string[];
  difficulty: Difficulty;
  expectedTimeSec: number;
  subject: string;
  topic: string;
  passage: { title: string; body: string } | null;
  askedIn: { company: string; months: string[] }[];
  bookmarked: boolean;
};

const studentQuestionSelect = (userId: string) =>
  ({
    id: true,
    externalId: true,
    type: true,
    text: true,
    code: true,
    codeLanguage: true,
    options: true,
    difficulty: true,
    expectedTimeSec: true,
    subject: { select: { name: true } },
    topic: { select: { name: true } },
    passage: { select: { title: true, body: true } },
    companies: {
      where: { company: { status: "PUBLISHED" } },
      select: { askedIn: true, company: { select: { name: true } } },
    },
    bookmarks: { where: { userId }, select: { userId: true } },
  }) satisfies Prisma.QuestionSelect;

type SelectedQuestion = Prisma.QuestionGetPayload<{
  select: ReturnType<typeof studentQuestionSelect>;
}>;

function toStudentQuestion(q: SelectedQuestion): StudentQuestion {
  return {
    id: q.id,
    externalId: q.externalId,
    type: q.type,
    text: q.text,
    code: q.code,
    codeLanguage: q.codeLanguage,
    options: q.options,
    difficulty: q.difficulty,
    expectedTimeSec: q.expectedTimeSec,
    subject: q.subject.name,
    topic: q.topic.name,
    passage: q.passage,
    askedIn: q.companies
      .filter((c) => c.askedIn.length > 0)
      .map((c) => ({ company: c.company.name, months: c.askedIn })),
    bookmarked: q.bookmarks.length > 0,
  };
}

// ---------- Choosing the next question ----------

export const PRACTICE_SOURCES = ["all", "unattempted", "mistakes", "bookmarks", "recent"] as const;
export type PracticeSource = (typeof PRACTICE_SOURCES)[number];

export type PracticeFilter = {
  subject?: string;
  topic?: string;
  subtopic?: string;
  company?: string;
  difficulty?: Difficulty;
  source: PracticeSource;
};

function filterWhere(
  userId: string,
  filter: PracticeFilter,
  exclude: string[],
): Prisma.QuestionWhereInput {
  return {
    status: "PUBLISHED",
    ...(exclude.length ? { id: { notIn: exclude } } : {}),
    ...(filter.subject ? { subject: { slug: filter.subject } } : {}),
    ...(filter.topic ? { topic: { slug: filter.topic } } : {}),
    ...(filter.subtopic && filter.topic
      ? { subtopic: { slug: filter.subtopic, topic: { slug: filter.topic } } }
      : {}),
    ...(filter.company
      ? { companies: { some: { company: { slug: filter.company, status: "PUBLISHED" } } } }
      : {}),
    ...(filter.difficulty ? { difficulty: filter.difficulty } : {}),
    ...(filter.source === "mistakes" ? { mistakes: { some: { userId, resolvedAt: null } } } : {}),
    ...(filter.source === "bookmarks" ? { bookmarks: { some: { userId } } } : {}),
    ...(filter.source === "recent" ? { companies: { some: { askedIn: { isEmpty: false } } } } : {}),
    ...(filter.source === "unattempted" ? { attempts: { none: { userId } } } : {}),
  };
}

/**
 * Next question for a practice session: questions the student hasn't tried come first, easy to
 * hard (PRD 4.4); then the rest. `exclude` holds the questions already shown this session.
 */
export async function nextQuestion(
  userId: string,
  filter: PracticeFilter,
  exclude: string[],
): Promise<StudentQuestion | null> {
  const where = filterWhere(userId, filter, exclude.slice(-500));
  const orderBy: Prisma.QuestionOrderByWithRelationInput[] = [
    { difficulty: "asc" },
    { externalId: "asc" },
  ];
  const select = studentQuestionSelect(userId);

  const fresh =
    filter.source === "all"
      ? await db.question.findFirst({
          where: { ...where, attempts: { none: { userId } } },
          orderBy,
          select,
        })
      : null;
  const question = fresh ?? (await db.question.findFirst({ where, orderBy, select }));
  return question ? toStudentQuestion(question) : null;
}

export async function countQuestions(userId: string, filter: PracticeFilter): Promise<number> {
  return db.question.count({ where: filterWhere(userId, filter, []) });
}

export async function getStudentQuestion(
  userId: string,
  questionId: string,
): Promise<StudentQuestion | null> {
  const question = await db.question.findFirst({
    where: { id: questionId, status: "PUBLISHED" },
    select: studentQuestionSelect(userId),
  });
  return question ? toStudentQuestion(question) : null;
}

// ---------- Free plan limit ----------

export type Usage = { used: number; limit: number | null };

/** Today's counted answers. Admins previewing the student app aren't limited. */
export async function practiceUsage(
  user: Pick<CurrentUser, "id" | "roles">,
  today = istDay(),
  access?: Access,
): Promise<Usage> {
  const used = await db.attempt.count({
    where: { userId: user.id, activityDate: today, mode: { in: ["PRACTICE", "RETRY"] } },
  });
  // Pro (and admins previewing) have no daily limit (D-040).
  const limit = isPro(access ?? (await getAccess(user)))
    ? null
    : await getSetting("limits.freeMcqPerDay");
  return { used, limit };
}

// ---------- Answering ----------

export type AnswerInput = {
  questionId: string;
  selectedOptions: string[];
  numericAnswer: number | null;
  timeSec: number;
  mode: AttemptMode;
};

export type AnswerResult =
  | {
      status: "answered";
      correct: boolean;
      correctOptions: string[];
      numericAnswer: number | null;
      tolerance: number | null;
      explanation: string;
      expectedTimeSec: number;
      mastery: { topic: string; before: number; after: number };
      usage: Usage;
    }
  | { status: "limit"; usage: Usage }
  | { status: "not-found" };

export async function submitAnswer(
  user: CurrentUser,
  input: AnswerInput,
  now = new Date(),
): Promise<AnswerResult> {
  const question = await db.question.findFirst({
    where: { id: input.questionId, status: "PUBLISHED" },
    select: {
      id: true,
      type: true,
      correctOptions: true,
      numericAnswer: true,
      tolerance: true,
      explanation: true,
      expectedTimeSec: true,
      difficulty: true,
      topicId: true,
      topic: { select: { name: true } },
    },
  });
  if (!question) return { status: "not-found" };

  const today = istDay(now);
  // Only today's question of the day skips the free limit; the mode comes from the browser.
  const mode =
    input.mode === "DAILY" && (await getDailyQuestionId(today)) !== question.id
      ? "PRACTICE"
      : input.mode;
  const counted = mode !== "DAILY";
  const access = await getAccess(user, now);
  const usage = await practiceUsage(user, today, access);
  // A company pack covers that company's questions, whatever the daily count.
  if (
    counted &&
    usage.limit !== null &&
    usage.used >= usage.limit &&
    !(await questionCovered(access, question.id))
  )
    return { status: "limit", usage };

  const correct = gradeAnswer(question, {
    selectedOptions: input.selectedOptions,
    numericAnswer: input.numericAnswer,
  });
  const rules = await freezeRules();

  const masteryChange = await db.$transaction(async (tx) => {
    await tx.attempt.create({
      data: {
        userId: user.id,
        questionId: question.id,
        mode,
        selectedOptions: input.selectedOptions,
        numericAnswer: input.numericAnswer,
        isCorrect: correct,
        timeSec: input.timeSec,
        activityDate: today,
      },
    });

    const previous = await tx.mastery.findUnique({
      where: { userId_topicId: { userId: user.id, topicId: question.topicId } },
    });
    const next = applyAnswer(previous ?? EMPTY_MASTERY, {
      correct,
      difficulty: question.difficulty,
    });
    await tx.mastery.upsert({
      where: { userId_topicId: { userId: user.id, topicId: question.topicId } },
      create: { userId: user.id, topicId: question.topicId, ...next },
      update: next,
    });

    if (correct) {
      await tx.mistake.updateMany({
        where: { userId: user.id, questionId: question.id, resolvedAt: null },
        data: { resolvedAt: now },
      });
    } else {
      await tx.mistake.upsert({
        where: { userId_questionId: { userId: user.id, questionId: question.id } },
        create: { userId: user.id, questionId: question.id, lastWrongAt: now },
        update: { lastWrongAt: now, resolvedAt: null },
      });
    }

    await recordDailyActivity(tx, user.id, today, { attempts: 1, correct: correct ? 1 : 0 }, rules);

    return { before: previous?.score ?? 0, after: next.score };
  });

  return {
    status: "answered",
    correct,
    correctOptions: question.correctOptions,
    numericAnswer: question.numericAnswer,
    tolerance: question.tolerance,
    explanation: question.explanation,
    expectedTimeSec: question.expectedTimeSec,
    mastery: { topic: question.topic.name, ...masteryChange },
    usage: { ...usage, used: usage.used + (counted ? 1 : 0) },
  };
}

// ---------- Bookmarks and error reports ----------

export async function toggleBookmark(userId: string, questionId: string): Promise<boolean> {
  const existing = await db.bookmark.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });
  if (existing) {
    await db.bookmark.delete({ where: { userId_questionId: { userId, questionId } } });
    return false;
  }
  const published = await db.question.count({ where: { id: questionId, status: "PUBLISHED" } });
  if (!published) return false;
  await db.bookmark.create({ data: { userId, questionId } });
  return true;
}

const MAX_REPORTS_PER_DAY = 20;

export async function reportError(
  userId: string,
  input: { questionId: string; reason: ReportReason; message: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db.errorReport.count({ where: { userId, createdAt: { gte: since } } });
  if (recent >= MAX_REPORTS_PER_DAY)
    return { ok: false, error: "You've sent a lot of reports today. Try again tomorrow." };
  const exists = await db.question.count({ where: { id: input.questionId, status: "PUBLISHED" } });
  if (!exists) return { ok: false, error: "This question is no longer available." };

  await db.errorReport.create({ data: { ...input, userId } });
  return { ok: true };
}

// ---------- Question of the day ----------

/** Today's question: picked once per IST day, the same for everyone. */
export async function getDailyQuestionId(today = istDay()): Promise<string | null> {
  const existing = await db.dailyQuestion.findUnique({ where: { date: today } });
  if (existing) return existing.questionId;

  const count = await db.question.count({ where: { status: "PUBLISHED" } });
  if (count === 0) return null;
  const index = createHash("sha256").update(today.toISOString()).digest().readUInt32BE(0) % count;
  const pick = await db.question.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { id: "asc" },
    skip: index,
    select: { id: true },
  });
  if (!pick) return null;

  // Two first requests at once: the second insert fails on the date key; use the winner.
  await db.dailyQuestion.createMany({
    data: [{ date: today, questionId: pick.id }],
    skipDuplicates: true,
  });
  const saved = await db.dailyQuestion.findUnique({ where: { date: today } });
  return saved?.questionId ?? pick.id;
}

/** Whether (and how) the student already answered today's question. */
export async function dailyAnswer(userId: string, questionId: string, today = istDay()) {
  return db.attempt.findFirst({
    where: { userId, questionId, mode: "DAILY", activityDate: today },
    select: { isCorrect: true },
  });
}
