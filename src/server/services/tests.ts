import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type {
  Difficulty,
  PlatformStyle,
  SectionNavigation,
  SectionType,
  SubmissionKind,
  TestKind,
  Verdict,
} from "@/generated/prisma/enums";
import { OPTION_LETTERS } from "@/lib/content/question-rules";
import {
  CODING_LANGUAGES,
  DEFAULT_STARTERS,
  effectiveTimeLimit,
  isCodingLanguage,
  type CodingLanguage,
} from "@/lib/coding/languages";
import { resultsAt } from "@/lib/contests/ranking";
import { testBadges } from "@/lib/engagement/badges";
import { istDay } from "@/lib/learning/dates";
import type { FreezeRules } from "@/lib/learning/streak";
import { applyAnswer, EMPTY_MASTERY } from "@/lib/learning/mastery";
import { isAdmin } from "@/lib/permissions";
import {
  canAdvance,
  canAnswer,
  GRACE_MS,
  maxEnd,
  sittingClock,
  type ClockState,
} from "@/lib/tests/clock";
import {
  percentile,
  scoreItem,
  scoreSections,
  type ScoredInput,
  type SectionScore,
} from "@/lib/tests/scoring";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { enqueueJob } from "@/server/jobs/queue";
import { createSubmission, type SubmitResult } from "@/server/services/coding";
import { coversCompany, isPro, type Access } from "@/lib/commerce/access";
import { getAccess } from "@/server/services/access";
import { awardBadges, freezeRules, recordDailyActivity } from "@/server/services/engagement";
import { getSetting } from "@/server/services/settings";

type Viewer = Pick<CurrentUser, "id" | "roles">;

/** Section settings frozen into the sitting when it starts. */
export type SectionSnapshot = {
  name: string;
  type: SectionType;
  minutes: number;
  marksPerItem: number;
  negativeMarks: number;
  canGoBack: boolean;
};

export const KIND_LABELS: Record<TestKind, string> = {
  TOPIC: "Topic test",
  COMPANY_MOCK: "Company mock",
  OA: "Coding assessment",
};

// ---------- Catalogue ----------

export type TestCard = {
  slug: string;
  title: string;
  description: string | null;
  kind: TestKind;
  platformStyle: PlatformStyle;
  company: { name: string; slug: string } | null;
  minutes: number;
  items: number;
  sections: { name: string; type: SectionType; items: number; minutes: number }[];
  taken: number;
  best: { score: number; maxScore: number } | null;
  inProgressId: string | null;
  locked: boolean;
};

// Starting and submitting are the busiest moments (everyone at a contest's start and end). Under
// load they queue for a database connection rather than failing after Prisma's 2 s default (D-065).
const SITTING_TX_WAIT_MS = 15_000;

const blueprintCardSelect = {
  slug: true,
  title: true,
  description: true,
  kind: true,
  platformStyle: true,
  companyId: true,
  company: { select: { name: true, slug: true } },
  sections: {
    orderBy: { order: "asc" },
    select: { name: true, type: true, minutes: true, rules: { select: { count: true } } },
  },
} satisfies Prisma.TestBlueprintSelect;

export async function listTests(user: Viewer): Promise<TestCard[]> {
  const [blueprints, sittings, limit] = await Promise.all([
    db.testBlueprint.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ kind: "asc" }, { title: "asc" }],
      select: { id: true, ...blueprintCardSelect },
    }),
    db.testSitting.findMany({
      // All-India mock sittings are separate: they never lock or resume a normal test.
      where: { userId: user.id, contestId: null },
      select: {
        id: true,
        blueprintId: true,
        status: true,
        score: true,
        maxScore: true,
        blueprint: { select: { kind: true, companyId: true } },
      },
    }),
    mockLimit(user),
  ]);
  return blueprints.map((b) => {
    const mine = sittings.filter((s) => s.blueprintId === b.id);
    const done = mine.filter((s) => s.status === "SUBMITTED" && s.score !== null);
    const best = done.reduce<{ score: number; maxScore: number } | null>(
      (top, s) =>
        !top || s.score! > top.score ? { score: s.score!, maxScore: s.maxScore ?? 0 } : top,
      null,
    );
    const inProgress = mine.find((s) => s.status === "IN_PROGRESS");
    return {
      slug: b.slug,
      title: b.title,
      description: b.description,
      kind: b.kind,
      platformStyle: b.platformStyle,
      company: b.company,
      minutes: b.sections.reduce((sum, s) => sum + s.minutes, 0),
      items: b.sections.reduce((sum, s) => sum + s.rules.reduce((n, r) => n + r.count, 0), 0),
      sections: b.sections.map((s) => ({
        name: s.name,
        type: s.type,
        minutes: s.minutes,
        items: s.rules.reduce((n, r) => n + r.count, 0),
      })),
      taken: done.length,
      best,
      inProgressId: inProgress?.id ?? null,
      locked: !inProgress && isLocked(b, sittings, limit),
    };
  });
}

export async function getTestCard(
  user: Viewer,
  slug: string,
): Promise<(TestCard & { instructions: string | null; navigation: SectionNavigation }) | null> {
  const blueprint = await db.testBlueprint.findFirst({
    where: { slug, ...(isAdmin(user.roles) ? {} : { status: "PUBLISHED" }) },
    select: { id: true, instructions: true, navigation: true, ...blueprintCardSelect },
  });
  if (!blueprint) return null;
  const cards = await listTests(user);
  const card = cards.find((c) => c.slug === slug);
  if (card)
    return { ...card, instructions: blueprint.instructions, navigation: blueprint.navigation };
  // Admin previewing a draft.
  return {
    slug: blueprint.slug,
    title: blueprint.title,
    description: blueprint.description,
    kind: blueprint.kind,
    platformStyle: blueprint.platformStyle,
    company: blueprint.company,
    minutes: blueprint.sections.reduce((sum, s) => sum + s.minutes, 0),
    items: blueprint.sections.reduce((sum, s) => sum + s.rules.reduce((n, r) => n + r.count, 0), 0),
    sections: blueprint.sections.map((s) => ({
      name: s.name,
      type: s.type,
      minutes: s.minutes,
      items: s.rules.reduce((n, r) => n + r.count, 0),
    })),
    taken: 0,
    best: null,
    inProgressId: null,
    locked: false,
    instructions: blueprint.instructions,
    navigation: blueprint.navigation,
  };
}

// ---------- Free plan ----------

type MockRules = { limit: number | null; access: Access };

async function mockLimit(user: Viewer): Promise<MockRules> {
  const access = await getAccess(user);
  // Pro lifts the limit; a company pack lifts it for that company (D-040).
  return { access, limit: isPro(access) ? null : await getSetting("limits.freeMocksPerCompany") };
}

/** Free users get a limited number of full mocks per company; topic tests are unlimited. */
function isLocked(
  blueprint: { kind: TestKind; companyId: string | null },
  sittings: { blueprint: { kind: TestKind; companyId: string | null } }[],
  { limit, access }: MockRules,
): boolean {
  if (limit === null || blueprint.kind !== "COMPANY_MOCK" || !blueprint.companyId) return false;
  if (coversCompany(access, [blueprint.companyId])) return false;
  const used = sittings.filter(
    (s) => s.blueprint.kind === "COMPANY_MOCK" && s.blueprint.companyId === blueprint.companyId,
  ).length;
  return used >= limit;
}

// ---------- Starting ----------

export type StartResult =
  | { status: "started"; sittingId: string }
  | { status: "locked" }
  | { status: "not-enough"; message: string }
  | { status: "not-found" };

export const shuffle = <T>(items: T[], random: () => number): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

type Rule = {
  topicId: string;
  difficulty: Difficulty | null;
  count: number;
  topic: { name: string };
};

/** Picks items for one rule: unseen first, then random. Returns null when there aren't enough. */
async function draw(
  tx: Prisma.TransactionClient,
  // Prefers items this student hasn't seen; "" (no student) treats everything as unseen.
  userId: string,
  type: SectionType,
  rule: Rule,
  taken: Set<string>,
  random: () => number,
): Promise<string[] | null> {
  const candidates =
    type === "MCQ"
      ? (
          await tx.question.findMany({
            where: {
              status: "PUBLISHED",
              topicId: rule.topicId,
              ...(rule.difficulty && { difficulty: rule.difficulty }),
            },
            select: { id: true, attempts: { where: { userId }, select: { id: true }, take: 1 } },
          })
        ).map((q) => ({ id: q.id, seen: q.attempts.length > 0 }))
      : (
          await tx.problem.findMany({
            where: {
              status: "PUBLISHED",
              validatedAt: { not: null },
              topics: { some: { id: rule.topicId } },
              ...(rule.difficulty && { difficulty: rule.difficulty }),
            },
            select: {
              id: true,
              progress: { where: { userId }, select: { attempts: true }, take: 1 },
            },
          })
        ).map((p) => ({ id: p.id, seen: (p.progress[0]?.attempts ?? 0) > 0 }));

  const fresh = candidates.filter((c) => !taken.has(c.id));
  if (fresh.length < rule.count) return null;
  const ordered = [
    ...shuffle(
      fresh.filter((c) => !c.seen),
      random,
    ),
    ...shuffle(
      fresh.filter((c) => c.seen),
      random,
    ),
  ];
  const picked = ordered.slice(0, rule.count).map((c) => c.id);
  picked.forEach((id) => taken.add(id));
  return picked;
}

export type DrawnItem = {
  sectionIndex: number;
  position: number;
  questionId?: string;
  problemId?: string;
};

/**
 * Draws a blueprint's questions: each rule's count from its topic, no item twice, topics mixed
 * within a section as real tests do. Used for sittings and for All-India mock question sets.
 */
export async function drawItems(
  tx: Prisma.TransactionClient,
  blueprint: { sections: { name: string; type: SectionType; rules: Rule[] }[] },
  userId: string | null,
  random: () => number = Math.random,
): Promise<{ ok: true; items: DrawnItem[] } | { ok: false; message: string }> {
  const taken = new Set<string>();
  const items: DrawnItem[] = [];
  for (const [sectionIndex, section] of blueprint.sections.entries()) {
    const ids: string[] = [];
    for (const rule of section.rules) {
      const picked = await draw(tx, userId ?? "", section.type, rule, taken, random);
      if (!picked) {
        return {
          ok: false,
          message: `Not enough ${section.type === "MCQ" ? "questions" : "problems"} in ${rule.topic.name} for "${section.name}" yet.`,
        };
      }
      ids.push(...picked);
    }
    shuffle(ids, random).forEach((id, position) =>
      items.push({
        sectionIndex,
        position,
        ...(section.type === "MCQ" ? { questionId: id } : { problemId: id }),
      }),
    );
  }
  return { ok: true, items };
}

export async function startSitting(
  user: Viewer,
  slug: string,
  now = new Date(),
  random: () => number = Math.random,
): Promise<StartResult> {
  const blueprint = await db.testBlueprint.findFirst({
    where: { slug, ...(isAdmin(user.roles) ? {} : { status: "PUBLISHED" }) },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { rules: { include: { topic: { select: { name: true } } } } },
      },
    },
  });
  if (!blueprint) return { status: "not-found" };

  const open = await db.testSitting.findFirst({
    where: { userId: user.id, blueprintId: blueprint.id, status: "IN_PROGRESS", contestId: null },
    select: { id: true },
  });
  if (open) return { status: "started", sittingId: open.id };

  const sittings = await db.testSitting.findMany({
    where: { userId: user.id, contestId: null },
    select: { blueprint: { select: { kind: true, companyId: true } } },
  });
  if (isLocked(blueprint, sittings, await mockLimit(user))) return { status: "locked" };

  const sections: SectionSnapshot[] = blueprint.sections.map((s) => ({
    name: s.name,
    type: s.type,
    minutes: s.minutes,
    marksPerItem: s.marksPerItem,
    negativeMarks: s.negativeMarks,
    canGoBack: s.canGoBack,
  }));
  const endsAt = maxEnd(now, sections);

  const result = await db.$transaction(
    async (tx): Promise<StartResult> => {
      const drawn = await drawItems(tx, blueprint, user.id, random);
      if (!drawn.ok) return { status: "not-enough", message: drawn.message };
      const sitting = await tx.testSitting.create({
        data: { userId: user.id, blueprintId: blueprint.id, startedAt: now, sections, endsAt },
        select: { id: true },
      });
      await tx.sittingItem.createMany({
        data: drawn.items.map((item) => ({ ...item, sittingId: sitting.id })),
      });
      return { status: "started", sittingId: sitting.id };
    },
    { timeout: 20_000, maxWait: SITTING_TX_WAIT_MS },
  );

  if (result.status === "started") {
    await enqueueJob(
      "test.autosubmit",
      { sittingId: result.sittingId },
      { runAt: new Date(endsAt.getTime() + GRACE_MS), maxAttempts: 5 },
    );
  }
  return result;
}

// ---------- Taking the test ----------

type SittingRecord = Prisma.TestSittingGetPayload<{
  include: { blueprint: { select: { navigation: true } } };
}>;

function clockOf(sitting: SittingRecord, now: Date): ClockState {
  return sittingClock({
    navigation: sitting.blueprint.navigation,
    sections: sitting.sections as SectionSnapshot[],
    startedAt: sitting.startedAt,
    sectionStarts: sitting.sectionStarts as (string | null)[],
    now,
  });
}

async function loadSitting(userId: string, sittingId: string) {
  return db.testSitting.findFirst({
    where: { id: sittingId, userId },
    include: { blueprint: { select: { navigation: true } } },
  });
}

export type RunnerItem = {
  id: string;
  section: number;
  position: number;
  selectedOptions: string[];
  numericAnswer: number | null;
  markedForReview: boolean;
  visited: boolean;
  timeSec: number;
} & (
  | {
      kind: "mcq";
      question: {
        type: "SINGLE" | "MULTIPLE" | "NUMERIC";
        text: string;
        code: string | null;
        codeLanguage: string | null;
        options: string[];
        passage: { title: string; body: string } | null;
      };
    }
  | {
      kind: "coding";
      problem: {
        id: string;
        title: string;
        statement: string;
        inputFormat: string;
        outputFormat: string;
        constraints: string;
        samples: { input: string; output: string; explanation: string | null }[];
        languages: { id: CodingLanguage; label: string; timeLimitMs: number }[];
        starters: Partial<Record<CodingLanguage, string>>;
        scoring: string;
      };
      coding: {
        bestScore: number | null;
        lastVerdict: Verdict | null;
        lastCode: { language: string; code: string } | null;
      };
    }
);

export type RunnerView = {
  id: string;
  title: string;
  kind: TestKind;
  platformStyle: PlatformStyle;
  navigation: SectionNavigation;
  sections: (SectionSnapshot & { start: number; end: number })[];
  current: number | null;
  endsAt: number;
  serverNow: number;
  tabSwitches: number;
  items: RunnerItem[];
};

export async function getRunnerView(
  user: Viewer,
  sittingId: string,
  now = new Date(),
): Promise<{ status: "running"; view: RunnerView } | { status: "submitted" } | null> {
  const sitting = await loadSitting(user.id, sittingId);
  if (!sitting) return null;
  if (sitting.status === "SUBMITTED") return { status: "submitted" };
  const clock = clockOf(sitting, now);
  if (clock.expired && now.getTime() > clock.endsAt + GRACE_MS) {
    // Time ran out while the student was away: finish it now instead of waiting for the job.
    await finishSitting(sitting.id, { auto: true, now });
    return { status: "submitted" };
  }

  const [blueprint, items] = await Promise.all([
    db.testBlueprint.findUniqueOrThrow({
      where: { id: sitting.blueprintId },
      select: { title: true, kind: true, platformStyle: true, navigation: true },
    }),
    db.sittingItem.findMany({
      where: { sittingId: sitting.id },
      orderBy: [{ sectionIndex: "asc" }, { position: "asc" }],
      include: {
        question: {
          select: {
            type: true,
            text: true,
            code: true,
            codeLanguage: true,
            options: true,
            passage: { select: { title: true, body: true } },
          },
        },
        problem: {
          include: {
            testCases: { where: { isSample: true }, orderBy: { order: "asc" } },
            solutions: { where: { kind: "STARTER" } },
          },
        },
        submissions: {
          where: { kind: "SUBMIT" },
          orderBy: { createdAt: "desc" },
          select: { verdict: true, score: true, language: true, code: true },
        },
      },
    }),
  ]);

  const sections = sitting.sections as SectionSnapshot[];
  return {
    status: "running",
    view: {
      id: sitting.id,
      title: blueprint.title,
      kind: blueprint.kind,
      platformStyle: blueprint.platformStyle,
      navigation: blueprint.navigation,
      sections: sections.map((s, i) => ({ ...s, ...clock.windows[i]! })),
      current: clock.current,
      endsAt: clock.endsAt,
      serverNow: now.getTime(),
      tabSwitches: sitting.tabSwitches,
      items: items.map((item): RunnerItem => {
        const base = {
          id: item.id,
          section: item.sectionIndex,
          position: item.position,
          selectedOptions: item.selectedOptions,
          numericAnswer: item.numericAnswer,
          markedForReview: item.markedForReview,
          visited: item.visited,
          timeSec: item.timeSec,
        };
        if (item.question) return { ...base, kind: "mcq", question: item.question };
        const p = item.problem!;
        const languages = p.languages.filter(isCodingLanguage);
        const scored = item.submissions.filter((s) => s.score !== null);
        return {
          ...base,
          kind: "coding",
          problem: {
            id: p.id,
            title: p.title,
            statement: p.statement,
            inputFormat: p.inputFormat,
            outputFormat: p.outputFormat,
            constraints: p.constraints,
            samples: p.testCases.map((t) => ({
              input: t.input,
              output: t.output,
              explanation: t.explanation,
            })),
            languages: languages.map((id) => ({
              id,
              label: CODING_LANGUAGES[id].label,
              timeLimitMs: effectiveTimeLimit(id, p.timeLimitMs),
            })),
            starters: Object.fromEntries(
              languages.map((id) => [
                id,
                p.solutions.find((s) => s.language === id)?.code ?? DEFAULT_STARTERS[id],
              ]),
            ),
            scoring: p.scoring,
          },
          coding: {
            bestScore: scored.length ? Math.max(...scored.map((s) => s.score!)) : null,
            lastVerdict: item.submissions[0]?.verdict ?? null,
            lastCode: item.submissions[0]
              ? { language: item.submissions[0].language, code: item.submissions[0].code }
              : null,
          },
        };
      }),
    },
  };
}

export type ItemPatch = {
  selectedOptions?: string[];
  numericAnswer?: number | null;
  markedForReview?: boolean;
  visited?: boolean;
  /** Seconds spent on the item since the last save. */
  addTimeSec?: number;
};

export type SaveResult = { ok: true } | { ok: false; reason: "closed" | "invalid" | "not-found" };

/** Autosave for one item. Rejected once its section has closed (after the grace period). */
export async function saveItem(
  user: Viewer,
  sittingId: string,
  itemId: string,
  patch: ItemPatch,
  now = new Date(),
): Promise<SaveResult> {
  const sitting = await loadSitting(user.id, sittingId);
  if (!sitting) return { ok: false, reason: "not-found" };
  if (sitting.status !== "IN_PROGRESS") return { ok: false, reason: "closed" };
  const item = await db.sittingItem.findFirst({
    where: { id: itemId, sittingId },
    include: { question: { select: { type: true, options: true } } },
  });
  if (!item) return { ok: false, reason: "not-found" };
  if (!canAnswer(clockOf(sitting, now), item.sectionIndex, now))
    return { ok: false, reason: "closed" };

  const data: Prisma.SittingItemUpdateInput = {};
  if (patch.selectedOptions !== undefined) {
    const letters = OPTION_LETTERS.slice(
      0,
      item.question?.options.length ?? 0,
    ) as readonly string[];
    const selected = [...new Set(patch.selectedOptions)].sort();
    if (!item.question || item.question.type === "NUMERIC") return { ok: false, reason: "invalid" };
    if (selected.some((o) => !letters.includes(o))) return { ok: false, reason: "invalid" };
    if (item.question.type === "SINGLE" && selected.length > 1)
      return { ok: false, reason: "invalid" };
    data.selectedOptions = selected;
  }
  if (patch.numericAnswer !== undefined) {
    if (item.question?.type !== "NUMERIC") return { ok: false, reason: "invalid" };
    if (patch.numericAnswer !== null && !Number.isFinite(patch.numericAnswer))
      return { ok: false, reason: "invalid" };
    data.numericAnswer = patch.numericAnswer;
  }
  if (patch.markedForReview !== undefined) data.markedForReview = patch.markedForReview;
  if (patch.visited) data.visited = true;
  if (patch.addTimeSec)
    data.timeSec = { increment: Math.min(Math.max(0, Math.round(patch.addTimeSec)), 600) };
  await db.sittingItem.update({ where: { id: item.id }, data });
  return { ok: true };
}

/** Sequential tests: finish the current section early and open the next one. */
export async function advanceSection(
  user: Viewer,
  sittingId: string,
  from: number,
  now = new Date(),
) {
  const sitting = await loadSitting(user.id, sittingId);
  if (!sitting || sitting.status !== "IN_PROGRESS" || sitting.blueprint.navigation !== "SEQUENTIAL")
    return false;
  const sections = sitting.sections as SectionSnapshot[];
  if (!canAdvance(clockOf(sitting, now), from, sections.length)) return false;
  const starts = [...(sitting.sectionStarts as (string | null)[])];
  while (starts.length <= from + 1) starts.push(null);
  starts[from + 1] = now.toISOString();
  await db.testSitting.update({ where: { id: sitting.id }, data: { sectionStarts: starts } });
  return true;
}

export async function recordTabSwitch(user: Viewer, sittingId: string) {
  await db.testSitting.updateMany({
    where: { id: sittingId, userId: user.id, status: "IN_PROGRESS" },
    data: { tabSwitches: { increment: 1 } },
  });
}

/** Run or submit code for a coding item inside a sitting. */
export async function submitSittingCode(
  user: Viewer,
  sittingId: string,
  itemId: string,
  input: { language: string; code: string; kind: SubmissionKind; customInput?: string | null },
  now = new Date(),
): Promise<SubmitResult | { status: "closed" }> {
  const sitting = await loadSitting(user.id, sittingId);
  if (!sitting) return { status: "not-found" };
  if (sitting.status !== "IN_PROGRESS") return { status: "closed" };
  const item = await db.sittingItem.findFirst({
    where: { id: itemId, sittingId },
    select: { problemId: true, sectionIndex: true },
  });
  if (!item?.problemId) return { status: "not-found" };
  if (!canAnswer(clockOf(sitting, now), item.sectionIndex, now)) return { status: "closed" };
  return createSubmission(
    user,
    { ...input, problemId: item.problemId, sittingItemId: itemId },
    now,
  );
}

// ---------- Finishing and scoring ----------

export async function submitSitting(user: Viewer, sittingId: string, now = new Date()) {
  const sitting = await loadSitting(user.id, sittingId);
  if (!sitting) return false;
  await finishSitting(sitting.id, { auto: false, now });
  return true;
}

/** Job "test.autosubmit": submits a sitting whose time has run out. */
export async function autoSubmitSitting(sittingId: string, now = new Date()): Promise<void> {
  const sitting = await db.testSitting.findUnique({
    where: { id: sittingId },
    include: { blueprint: { select: { navigation: true } } },
  });
  if (!sitting || sitting.status !== "IN_PROGRESS") return;
  const clock = clockOf(sitting, now);
  if (now.getTime() < clock.endsAt + GRACE_MS) {
    // Not over yet (clock moved): check again when it is.
    await enqueueJob(
      "test.autosubmit",
      { sittingId },
      { runAt: new Date(clock.endsAt + GRACE_MS), maxAttempts: 5 },
    );
    return;
  }
  await finishSitting(sittingId, { auto: true, now });
}

/** Scores the sitting once (a second call does nothing) and records answers for mastery. */
export async function finishSitting(
  sittingId: string,
  { auto, now }: { auto: boolean; now: Date },
) {
  const rules = await freezeRules();
  const finished = await db.$transaction(
    async (tx) => {
      const claimed = await tx.testSitting.updateMany({
        where: { id: sittingId, status: "IN_PROGRESS" },
        data: { status: "SUBMITTED", submittedAt: now, autoSubmitted: auto },
      });
      if (claimed.count === 0) return null;

      const sitting = await tx.testSitting.findUniqueOrThrow({ where: { id: sittingId } });
      const sections = sitting.sections as SectionSnapshot[];
      const items = await tx.sittingItem.findMany({
        where: { sittingId },
        include: {
          question: {
            select: {
              id: true,
              type: true,
              correctOptions: true,
              numericAnswer: true,
              tolerance: true,
              difficulty: true,
              topicId: true,
            },
          },
          submissions: { where: { kind: "SUBMIT", score: { not: null } }, select: { score: true } },
        },
      });

      const scored = items.map((item) => {
        const input: ScoredInput = item.question
          ? {
              kind: "mcq",
              section: item.sectionIndex,
              key: item.question,
              selectedOptions: item.selectedOptions,
              numericAnswer: item.numericAnswer,
            }
          : {
              kind: "coding",
              section: item.sectionIndex,
              bestScore: item.submissions.length
                ? Math.max(...item.submissions.map((s) => s.score!))
                : null,
            };
        return { item, input, score: scoreItem(input, sections[item.sectionIndex]!) };
      });
      // Items share a handful of results (right, wrong, skipped), so one update per result
      // rather than one per item: this transaction is what everyone runs at a contest's end.
      const byResult = new Map<
        string,
        { isCorrect: boolean | null; marks: number; ids: string[] }
      >();
      for (const { item, score } of scored) {
        const key = `${score.isCorrect}:${score.marks}`;
        const group = byResult.get(key) ?? {
          isCorrect: score.isCorrect,
          marks: score.marks,
          ids: [],
        };
        group.ids.push(item.id);
        byResult.set(key, group);
      }
      for (const { isCorrect, marks, ids } of byResult.values())
        await tx.sittingItem.updateMany({ where: { id: { in: ids } }, data: { isCorrect, marks } });
      const totals = scoreSections(
        sections,
        scored.map(({ input, score }) => ({ ...input, score })),
      );
      await tx.testSitting.update({
        where: { id: sittingId },
        data: { score: totals.score, maxScore: totals.maxScore },
      });

      await recordTestAnswers(tx, sitting.userId, scored, now, rules);
      return { userId: sitting.userId, contestId: sitting.contestId };
    },
    { timeout: 30_000, maxWait: SITTING_TX_WAIT_MS },
  );
  if (finished) {
    const count = await db.testSitting.count({
      where: { userId: finished.userId, status: "SUBMITTED" },
    });
    await awardBadges(db, finished.userId, [
      ...testBadges(count),
      ...(finished.contestId ? (["contest-debut"] as const) : []),
    ]);
  }
}

/** Answered MCQs count for mastery, mistakes and the streak (AttemptMode TEST). */
async function recordTestAnswers(
  tx: Prisma.TransactionClient,
  userId: string,
  scored: {
    item: {
      timeSec: number;
      selectedOptions: string[];
      numericAnswer: number | null;
      question: { id: string; difficulty: Difficulty; topicId: string } | null;
    };
    score: { answered: boolean; isCorrect: boolean | null };
  }[],
  now: Date,
  rules: FreezeRules,
) {
  const answered = scored.filter((s) => s.item.question && s.score.answered);
  if (!answered.length) return;
  const today = istDay(now);
  await tx.attempt.createMany({
    data: answered.map(({ item, score }) => ({
      userId,
      questionId: item.question!.id,
      mode: "TEST" as const,
      selectedOptions: item.selectedOptions,
      numericAnswer: item.numericAnswer,
      isCorrect: Boolean(score.isCorrect),
      timeSec: item.timeSec,
      activityDate: today,
      createdAt: now,
    })),
  });

  const byTopic = new Map<string, typeof answered>();
  for (const entry of answered) {
    const list = byTopic.get(entry.item.question!.topicId) ?? [];
    list.push(entry);
    byTopic.set(entry.item.question!.topicId, list);
  }
  for (const [topicId, entries] of byTopic) {
    const where = { userId_topicId: { userId, topicId } };
    const previous = await tx.mastery.findUnique({ where });
    let state = previous ?? EMPTY_MASTERY;
    let next = { ...state, score: previous?.score ?? 0 };
    for (const { item, score } of entries) {
      next = applyAnswer(state, {
        correct: Boolean(score.isCorrect),
        difficulty: item.question!.difficulty,
      });
      state = next;
    }
    await tx.mastery.upsert({ where, create: { userId, topicId, ...next }, update: next });
  }

  // Right answers resolve their mistakes; wrong ones open (or reopen) one. In bulk.
  const right = answered.filter((a) => a.score.isCorrect).map((a) => a.item.question!.id);
  const wrong = answered.filter((a) => !a.score.isCorrect).map((a) => a.item.question!.id);
  if (right.length)
    await tx.mistake.updateMany({
      where: { userId, questionId: { in: right }, resolvedAt: null },
      data: { resolvedAt: now },
    });
  if (wrong.length) {
    await tx.mistake.createMany({
      data: wrong.map((questionId) => ({ userId, questionId, lastWrongAt: now })),
      skipDuplicates: true,
    });
    await tx.mistake.updateMany({
      where: { userId, questionId: { in: wrong } },
      data: { lastWrongAt: now, resolvedAt: null },
    });
  }

  const correct = right.length;
  await recordDailyActivity(tx, userId, today, { attempts: answered.length, correct }, rules);
}

// ---------- Results ----------

export type ResultItem = {
  id: string;
  section: number;
  position: number;
  marks: number;
  isCorrect: boolean | null;
  timeSec: number;
  markedForReview: boolean;
  topic: { name: string; slug: string } | null;
} & (
  | {
      kind: "mcq";
      question: {
        externalId: string;
        type: "SINGLE" | "MULTIPLE" | "NUMERIC";
        text: string;
        code: string | null;
        codeLanguage: string | null;
        options: string[];
        correctOptions: string[];
        numericAnswer: number | null;
        tolerance: number | null;
        explanation: string;
        expectedTimeSec: number;
        passage: { title: string; body: string } | null;
      };
      selectedOptions: string[];
      numericAnswer: number | null;
    }
  | {
      kind: "coding";
      problem: { slug: string; title: string };
      best: { verdict: Verdict; testsPassed: number; testsTotal: number; score: number } | null;
    }
);

export type SittingResult = {
  id: string;
  title: string;
  blueprintSlug: string;
  kind: TestKind;
  company: { name: string; slug: string } | null;
  score: number;
  maxScore: number;
  percentile: number | null;
  submittedAt: string;
  autoSubmitted: boolean;
  tabSwitches: number;
  totalTimeSec: number;
  sections: (SectionScore & { timeSec: number; minutes: number })[];
  weakTopics: { name: string; slug: string; correct: number; total: number }[];
  items: ResultItem[];
  /** All-India mock: answers stay hidden (items empty) until `solutionsAt`, when results are final. */
  contest: { id: string; slug: string; title: string; solutionsAt: string | null } | null;
};

export async function getSittingResult(
  user: Viewer,
  sittingId: string,
  now = new Date(),
): Promise<SittingResult | null> {
  const sitting = await db.testSitting.findFirst({
    where: {
      id: sittingId,
      ...(isAdmin(user.roles) ? {} : { userId: user.id }),
      status: "SUBMITTED",
    },
    include: {
      blueprint: {
        select: {
          slug: true,
          title: true,
          kind: true,
          company: { select: { name: true, slug: true } },
        },
      },
      items: {
        orderBy: [{ sectionIndex: "asc" }, { position: "asc" }],
        include: {
          question: {
            select: {
              externalId: true,
              type: true,
              text: true,
              code: true,
              codeLanguage: true,
              options: true,
              correctOptions: true,
              numericAnswer: true,
              tolerance: true,
              explanation: true,
              expectedTimeSec: true,
              passage: { select: { title: true, body: true } },
              topic: { select: { name: true, slug: true } },
            },
          },
          problem: {
            select: {
              slug: true,
              title: true,
              topics: { select: { name: true, slug: true }, take: 1 },
            },
          },
          submissions: {
            where: { kind: "SUBMIT", score: { not: null } },
            orderBy: [{ score: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { verdict: true, testsPassed: true, testsTotal: true, score: true },
          },
        },
      },
    },
  });
  if (!sitting) return null;

  const contest = sitting.contestId
    ? await db.contest.findUnique({
        where: { id: sitting.contestId },
        select: {
          id: true,
          slug: true,
          title: true,
          startsAt: true,
          endsAt: true,
          sections: true,
          finalizedAt: true,
        },
      })
    : null;
  let solutionsAt: Date | null = null;
  if (contest && !contest.finalizedAt && !isAdmin(user.roles)) {
    const at = resultsAt({
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      durationMinutes: (contest.sections as SectionSnapshot[]).reduce((n, s) => n + s.minutes, 0),
    });
    if (now < at) solutionsAt = at;
  }

  // Normal tests compare with every sitting of the blueprint; contests rank separately.
  const others = contest
    ? []
    : await db.testSitting.findMany({
        where: {
          blueprintId: sitting.blueprintId,
          status: "SUBMITTED",
          contestId: null,
          id: { not: sitting.id },
          score: { not: null },
        },
        select: { score: true },
      });

  const sections = sitting.sections as SectionSnapshot[];
  const items: ResultItem[] = sitting.items.map((item) => {
    const base = {
      id: item.id,
      section: item.sectionIndex,
      position: item.position,
      marks: item.marks ?? 0,
      isCorrect: item.isCorrect,
      timeSec: item.timeSec,
      markedForReview: item.markedForReview,
    };
    if (item.question) {
      const { topic, ...question } = item.question;
      return {
        ...base,
        kind: "mcq",
        topic,
        question,
        selectedOptions: item.selectedOptions,
        numericAnswer: item.numericAnswer,
      };
    }
    const best = item.submissions[0];
    return {
      ...base,
      kind: "coding",
      topic: item.problem!.topics[0] ?? null,
      problem: { slug: item.problem!.slug, title: item.problem!.title },
      best: best ? { ...best, score: best.score! } : null,
    };
  });

  const sectionScores = sections.map((rules, index) => {
    const mine = items.filter((i) => i.section === index);
    return {
      name: rules.name,
      minutes: rules.minutes,
      score: round(mine.reduce((sum, i) => sum + i.marks, 0)),
      maxScore: round(mine.length * rules.marksPerItem),
      attempted: mine.filter((i) =>
        i.kind === "mcq"
          ? i.selectedOptions.length > 0 || i.numericAnswer !== null
          : i.best !== null,
      ).length,
      correct: mine.filter((i) => i.isCorrect).length,
      total: mine.length,
      timeSec: mine.reduce((sum, i) => sum + i.timeSec, 0),
    };
  });

  // Weak topics: under 60% right with at least two items, worst first.
  const topics = new Map<string, { name: string; slug: string; correct: number; total: number }>();
  for (const item of items) {
    if (item.kind !== "mcq" || !item.topic) continue;
    const entry = topics.get(item.topic.slug) ?? { ...item.topic, correct: 0, total: 0 };
    entry.total += 1;
    if (item.isCorrect) entry.correct += 1;
    topics.set(item.topic.slug, entry);
  }
  const weakTopics = [...topics.values()]
    .filter((t) => t.total >= 2 && t.correct / t.total < 0.6)
    .sort((a, b) => a.correct / a.total - b.correct / b.total);

  return {
    id: sitting.id,
    title: sitting.blueprint.title,
    blueprintSlug: sitting.blueprint.slug,
    kind: sitting.blueprint.kind,
    company: sitting.blueprint.company,
    score: sitting.score ?? 0,
    maxScore: sitting.maxScore ?? 0,
    percentile: percentile(
      sitting.score ?? 0,
      others.map((o) => o.score!),
    ),
    submittedAt: (sitting.submittedAt ?? sitting.startedAt).toISOString(),
    autoSubmitted: sitting.autoSubmitted,
    tabSwitches: sitting.tabSwitches,
    totalTimeSec: items.reduce((sum, i) => sum + i.timeSec, 0),
    sections: sectionScores,
    // While a contest runs, nothing that reveals answers leaves the server.
    weakTopics: solutionsAt ? [] : weakTopics,
    items: solutionsAt ? [] : items,
    contest: contest
      ? {
          id: contest.id,
          slug: contest.slug,
          title: contest.title,
          solutionsAt: solutionsAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function listHistory(userId: string, take = 30) {
  const sittings = await db.testSitting.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      score: true,
      maxScore: true,
      startedAt: true,
      submittedAt: true,
      autoSubmitted: true,
      blueprint: { select: { title: true, kind: true, slug: true } },
    },
  });
  return sittings;
}

const round = (n: number) => Math.round(n * 100) / 100;
