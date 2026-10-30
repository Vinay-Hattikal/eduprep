import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { Difficulty, SubmissionKind, Verdict } from "@/generated/prisma/enums";
import {
  CODING_LANGUAGES,
  DEFAULT_STARTERS,
  effectiveTimeLimit,
  isCodingLanguage,
  type CodingLanguage,
} from "@/lib/coding/languages";
import { istDay } from "@/lib/learning/dates";
import { applyAnswer, EMPTY_MASTERY } from "@/lib/learning/mastery";
import { solveBadges } from "@/lib/engagement/badges";
import type { FreezeRules } from "@/lib/learning/streak";
import { isAdmin } from "@/lib/permissions";
import { evaluate, type EvalTest, type TestResult } from "@/server/coding/evaluate";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { getJudge } from "@/server/integrations/judge";
import { enqueueJob } from "@/server/jobs/queue";
import { isPro } from "@/lib/commerce/access";
import { getAccess, problemCovered } from "@/server/services/access";
import { transitionProblem } from "@/server/services/problems";
import { awardBadges, freezeRules, recordDailyActivity } from "@/server/services/engagement";
import { getSetting } from "@/server/services/settings";

// ---------- Limits (PRD 4.5) ----------

export const MAX_CODE_CHARS = 64 * 1024;
export const MAX_CUSTOM_INPUT_CHARS = 64 * 1024;
/** Submissions (runs included) per user in RATE_WINDOW_MS. */
export const RATE_LIMIT = 20;
export const RATE_WINDOW_MS = 5 * 60_000;
/** A queued submission older than this no longer blocks new ones (the worker may be down). */
export const STALE_PENDING_MS = 2 * 60_000;

type Viewer = Pick<CurrentUser, "id" | "roles">;

const visibleTo = (user: Viewer): Prisma.ProblemWhereInput =>
  // Admins preview drafts in the student workspace.
  isAdmin(user.roles) ? {} : { status: "PUBLISHED" };

// ---------- Problem list ----------

export const PROBLEM_STATES = ["all", "todo", "attempted", "solved"] as const;
export type ProblemState = (typeof PROBLEM_STATES)[number];

export type ProblemFilter = {
  difficulty?: Difficulty;
  topic?: string;
  state?: ProblemState;
  q?: string;
};

export type ProblemListItem = {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: string[];
  companies: string[];
  state: Exclude<ProblemState, "all">;
  acceptance: number | null;
};

export async function listProblems(
  user: Viewer,
  filter: ProblemFilter,
): Promise<ProblemListItem[]> {
  const progress: Prisma.ProblemProgressListRelationFilter | undefined =
    filter.state === "solved"
      ? { some: { userId: user.id, solvedAt: { not: null } } }
      : filter.state === "attempted"
        ? { some: { userId: user.id, solvedAt: null, attempts: { gt: 0 } } }
        : filter.state === "todo"
          ? { none: { userId: user.id, attempts: { gt: 0 } } }
          : undefined;
  const problems = await db.problem.findMany({
    where: {
      ...visibleTo(user),
      ...(filter.difficulty && { difficulty: filter.difficulty }),
      ...(filter.topic && { topics: { some: { slug: filter.topic } } }),
      ...(filter.q && { title: { contains: filter.q, mode: "insensitive" } }),
      ...(progress && { progress }),
    },
    orderBy: [{ difficulty: "asc" }, { title: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      difficulty: true,
      topics: { select: { name: true }, orderBy: { name: "asc" } },
      companies: {
        where: { company: { status: "PUBLISHED" } },
        select: { company: { select: { name: true } } },
      },
      progress: { where: { userId: user.id }, select: { attempts: true, solvedAt: true } },
    },
  });

  const ids = problems.map((p) => p.id);
  const [totals, accepted] = await Promise.all([
    db.submission.groupBy({
      by: ["problemId"],
      where: { problemId: { in: ids }, kind: "SUBMIT", sittingItemId: null },
      _count: { _all: true },
    }),
    db.submission.groupBy({
      by: ["problemId"],
      where: { problemId: { in: ids }, kind: "SUBMIT", sittingItemId: null, verdict: "ACCEPTED" },
      _count: { _all: true },
    }),
  ]);
  const totalBy = new Map(totals.map((t) => [t.problemId, t._count._all]));
  const acceptedBy = new Map(accepted.map((t) => [t.problemId, t._count._all]));

  return problems.map((p) => {
    const mine = p.progress[0];
    const total = totalBy.get(p.id) ?? 0;
    return {
      slug: p.slug,
      title: p.title,
      difficulty: p.difficulty,
      topics: p.topics.map((t) => t.name),
      companies: p.companies.map((c) => c.company.name),
      state: mine?.solvedAt ? "solved" : mine?.attempts ? "attempted" : "todo",
      // Hide acceptance until it means something.
      acceptance: total >= 10 ? Math.round(((acceptedBy.get(p.id) ?? 0) / total) * 100) : null,
    };
  });
}

/** DSA topics that have at least one visible problem, for the filter. */
export async function listProblemTopics(user: Viewer) {
  return db.topic.findMany({
    where: { problems: { some: visibleTo(user) } },
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });
}

export async function codingSummary(userId: string) {
  const [solved, attempted] = await Promise.all([
    db.problemProgress.count({ where: { userId, solvedAt: { not: null } } }),
    db.problemProgress.count({ where: { userId, attempts: { gt: 0 } } }),
  ]);
  return { solved, attempted };
}

// ---------- Free plan ----------

export type CodingUsage = { used: number; limit: number | null };

/** Free users may work on a limited number of problems; ones already started stay open. */
export async function codingUsage(user: Viewer): Promise<CodingUsage> {
  const used = await db.problemProgress.count({ where: { userId: user.id } });
  // Pro lifts the limit (D-040); admins previewing aren't limited either.
  const limit = isPro(await getAccess(user)) ? null : await getSetting("limits.freeCodingProblems");
  return { used, limit };
}

async function canOpen(user: Viewer, problemId: string): Promise<boolean> {
  const usage = await codingUsage(user);
  if (usage.limit === null || usage.used < usage.limit) return true;
  const started = await db.problemProgress.findUnique({
    where: { userId_problemId: { userId: user.id, problemId } },
    select: { userId: true },
  });
  // A company pack opens that company's problems.
  return Boolean(started) || problemCovered(await getAccess(user), problemId);
}

// ---------- Workspace ----------

export type WorkspaceProblem = {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  status: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  languages: { id: CodingLanguage; label: string; timeLimitMs: number }[];
  starters: Partial<Record<CodingLanguage, string>>;
  samples: { input: string; output: string; explanation: string | null }[];
  topics: string[];
  companies: { name: string; slug: string; months: string[] }[];
  hintCount: number;
  hints: string[];
  editorial: string | null;
  /** Revealing one more step shows the editorial (after the last hint). */
  editorialLocked: boolean;
  solved: boolean;
  locked: boolean;
};

export async function getWorkspaceProblem(
  user: Viewer,
  slug: string,
): Promise<WorkspaceProblem | null> {
  const problem = await db.problem.findFirst({
    where: { slug, ...visibleTo(user) },
    include: {
      topics: { select: { name: true }, orderBy: { name: "asc" } },
      testCases: { where: { isSample: true }, orderBy: { order: "asc" } },
      solutions: { where: { kind: "STARTER" } },
      companies: {
        where: { company: { status: "PUBLISHED" } },
        select: { askedIn: true, company: { select: { name: true, slug: true } } },
      },
      progress: { where: { userId: user.id } },
    },
  });
  if (!problem) return null;

  const mine = problem.progress[0];
  const solved = Boolean(mine?.solvedAt);
  const revealed = mine?.hintsRevealed ?? 0;
  const editorialOpen = solved || revealed > problem.hints.length;
  const languages = problem.languages.filter(isCodingLanguage);
  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    status: problem.status,
    statement: problem.statement,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    languages: languages.map((id) => ({
      id,
      label: CODING_LANGUAGES[id].label,
      timeLimitMs: effectiveTimeLimit(id, problem.timeLimitMs),
    })),
    starters: Object.fromEntries(
      languages.map((id) => [
        id,
        problem.solutions.find((s) => s.language === id)?.code ?? DEFAULT_STARTERS[id],
      ]),
    ),
    samples: problem.testCases.map((t) => ({
      input: t.input,
      output: t.output,
      explanation: t.explanation,
    })),
    topics: problem.topics.map((t) => t.name),
    companies: problem.companies.map((c) => ({ ...c.company, months: c.askedIn })),
    hintCount: problem.hints.length,
    hints: solved ? problem.hints : problem.hints.slice(0, revealed),
    editorial: editorialOpen ? problem.editorial : null,
    editorialLocked: !editorialOpen && Boolean(problem.editorial),
    solved,
    locked: !(await canOpen(user, problem.id)),
  };
}

/** Shows the next hint; after the last hint, the editorial. */
export async function revealHint(user: Viewer, problemId: string) {
  const problem = await db.problem.findFirst({
    where: { id: problemId, ...visibleTo(user) },
    select: { hints: true, editorial: true },
  });
  if (!problem) return null;
  const steps = problem.hints.length + (problem.editorial ? 1 : 0);
  const current = await db.problemProgress.findUnique({
    where: { userId_problemId: { userId: user.id, problemId } },
  });
  const next = Math.min((current?.hintsRevealed ?? 0) + 1, steps);
  await db.problemProgress.upsert({
    where: { userId_problemId: { userId: user.id, problemId } },
    create: { userId: user.id, problemId, hintsRevealed: next },
    update: { hintsRevealed: next },
  });
  return next;
}

// ---------- Submissions ----------

export type SubmissionInput = {
  problemId: string;
  language: string;
  code: string;
  kind: SubmissionKind;
  /** RUN only: run this instead of the samples. */
  customInput?: string | null;
  sittingItemId?: string | null;
};

export type SubmitResult =
  | { status: "queued"; submissionId: string }
  | { status: "invalid"; message: string }
  | { status: "busy"; message: string }
  | { status: "limit"; usage: CodingUsage }
  | { status: "not-found" };

export async function createSubmission(
  user: Viewer,
  input: SubmissionInput,
  now = new Date(),
): Promise<SubmitResult> {
  const problem = await db.problem.findFirst({
    where: {
      id: input.problemId,
      // Inside a test, the item itself proves access; drafts never reach sittings.
      ...(input.sittingItemId ? {} : visibleTo(user)),
    },
    select: { id: true, languages: true },
  });
  if (!problem) return { status: "not-found" };
  if (!isCodingLanguage(input.language) || !problem.languages.includes(input.language)) {
    return { status: "invalid", message: "This problem doesn't accept that language." };
  }
  if (!input.code.trim()) return { status: "invalid", message: "Write some code first." };
  if (input.code.length > MAX_CODE_CHARS)
    return { status: "invalid", message: "Code is over 64 KB." };
  const customInput = input.kind === "RUN" ? (input.customInput ?? null) : null;
  if (customInput && customInput.length > MAX_CUSTOM_INPUT_CHARS) {
    return { status: "invalid", message: "Custom input is over 64 KB." };
  }

  const [pending, recent] = await Promise.all([
    db.submission.count({
      where: {
        userId: user.id,
        verdict: { in: ["PENDING", "RUNNING"] },
        createdAt: { gt: new Date(now.getTime() - STALE_PENDING_MS) },
      },
    }),
    db.submission.count({
      where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - RATE_WINDOW_MS) } },
    }),
  ]);
  if (pending > 0) return { status: "busy", message: "Your last run is still being judged." };
  if (recent >= RATE_LIMIT && !isAdmin(user.roles)) {
    return {
      status: "busy",
      message: "Too many runs in the last 5 minutes. Take a breath and try again shortly.",
    };
  }

  if (!input.sittingItemId) {
    if (!(await canOpen(user, problem.id)))
      return { status: "limit", usage: await codingUsage(user) };
    await db.problemProgress.upsert({
      where: { userId_problemId: { userId: user.id, problemId: problem.id } },
      create: { userId: user.id, problemId: problem.id },
      update: {},
    });
  }

  const submission = await db.submission.create({
    data: {
      userId: user.id,
      problemId: problem.id,
      sittingItemId: input.sittingItemId ?? null,
      kind: input.kind,
      language: input.language,
      code: input.code,
      customInput,
      createdAt: now,
    },
    select: { id: true },
  });
  await enqueueJob("code.judge", { submissionId: submission.id }, { maxAttempts: 2 });
  return { status: "queued", submissionId: submission.id };
}

export type SubmissionView = {
  id: string;
  kind: SubmissionKind;
  language: string;
  verdict: Verdict;
  testsPassed: number;
  testsTotal: number;
  score: number | null;
  runtimeMs: number | null;
  compileOutput: string | null;
  results: TestResult[];
  custom: boolean;
  createdAt: string;
  done: boolean;
};

const toView = (s: Prisma.SubmissionGetPayload<object>): SubmissionView => ({
  id: s.id,
  kind: s.kind,
  language: s.language,
  verdict: s.verdict,
  testsPassed: s.testsPassed,
  testsTotal: s.testsTotal,
  score: s.score,
  runtimeMs: s.runtimeMs,
  compileOutput: s.compileOutput,
  results: s.results as TestResult[],
  custom: s.customInput !== null,
  createdAt: s.createdAt.toISOString(),
  done: s.verdict !== "PENDING" && s.verdict !== "RUNNING",
});

export async function getSubmission(userId: string, id: string): Promise<SubmissionView | null> {
  const submission = await db.submission.findFirst({ where: { id, userId } });
  return submission ? toView(submission) : null;
}

export async function listSubmissions(userId: string, problemId: string, take = 20) {
  const submissions = await db.submission.findMany({
    where: { userId, problemId, kind: "SUBMIT", sittingItemId: null },
    orderBy: { createdAt: "desc" },
    take,
  });
  return submissions.map((s) => ({ ...toView(s), code: s.code }));
}

/** Job "code.judge": runs a queued submission. */
/**
 * Judges a submission. Returns the test item it answered, when it's a SUBMIT inside a test, so
 * the caller can re-score a test that was submitted while the code waited (D-065 review).
 */
export async function judgeSubmission(
  submissionId: string,
  now = () => new Date(),
): Promise<string | null> {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: { problem: { include: { testCases: { orderBy: { order: "asc" } } } } },
  });
  if (!submission || (submission.verdict !== "PENDING" && submission.verdict !== "RUNNING"))
    return null;
  const { problem } = submission;
  await db.submission.update({ where: { id: submission.id }, data: { verdict: "RUNNING" } });

  const tests: EvalTest[] =
    submission.kind === "RUN"
      ? submission.customInput !== null
        ? [{ input: submission.customInput, output: null, isSample: true }]
        : problem.testCases.filter((t) => t.isSample).map((t) => ({ ...t, isSample: true }))
      : problem.testCases.map((t) => ({ input: t.input, output: t.output, isSample: t.isSample }));

  let result;
  try {
    result = await evaluate(getJudge(), {
      language: submission.language as CodingLanguage,
      code: submission.code,
      limits: { timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb },
      checker: problem.checker,
      // A run shows every sample's result.
      scoring: submission.kind === "RUN" ? "PER_TEST" : problem.scoring,
      tests,
    });
  } catch (error) {
    await db.submission.update({
      where: { id: submission.id },
      data: { verdict: "INTERNAL_ERROR", finishedAt: now() },
    });
    throw error; // the queue retries; the retry starts over from RUNNING
  }

  const finishedAt = now();
  const rules = await freezeRules();
  await db.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: submission.id },
      data: {
        verdict: result.verdict,
        testsPassed: result.passed,
        testsTotal: result.total,
        score: result.score,
        runtimeMs: result.runtimeMs,
        compileOutput: result.compileOutput,
        results: result.results,
        finishedAt,
      },
    });
    if (submission.kind !== "SUBMIT" || submission.sittingItemId) return;
    await recordSubmit(
      tx,
      submission.userId,
      problem,
      result.verdict === "ACCEPTED",
      finishedAt,
      rules,
    );
  });
  return submission.kind === "SUBMIT" ? submission.sittingItemId : null;
}

/** A practice SUBMIT: attempts, first solve, DSA mastery and the daily streak. */
async function recordSubmit(
  tx: Prisma.TransactionClient,
  userId: string,
  problem: { id: string; difficulty: Difficulty },
  accepted: boolean,
  now: Date,
  rules: FreezeRules,
) {
  const key = { userId_problemId: { userId, problemId: problem.id } };
  const before = await tx.problemProgress.findUnique({ where: key });
  const firstSolve = accepted && !before?.solvedAt;
  await tx.problemProgress.upsert({
    where: key,
    create: { userId, problemId: problem.id, attempts: 1, solvedAt: accepted ? now : null },
    update: { attempts: { increment: 1 }, ...(firstSolve && { solvedAt: now }) },
  });

  // Mastery counts a problem once, when first solved, so retries never lower it.
  if (firstSolve) {
    const topics = await tx.topic.findMany({
      where: { problems: { some: { id: problem.id } } },
      select: { id: true },
    });
    for (const topic of topics) {
      const where = { userId_topicId: { userId, topicId: topic.id } };
      const previous = await tx.mastery.findUnique({ where });
      const next = applyAnswer(previous ?? EMPTY_MASTERY, {
        correct: true,
        difficulty: problem.difficulty,
      });
      await tx.mastery.upsert({
        where,
        create: { userId, topicId: topic.id, ...next },
        update: next,
      });
    }
    const solved = await tx.problemProgress.count({ where: { userId, solvedAt: { not: null } } });
    await awardBadges(tx, userId, solveBadges(solved));
  }

  // A submission counts for the streak, not as answered questions.
  await recordDailyActivity(tx, userId, istDay(now), { attempts: 0, correct: 0 }, rules);
}

// ---------- Problem validation (D-034) ----------

/**
 * Job "problem.validate": every reference (and brute) solution must pass every test. With
 * `publishBy`, a draft that passes is published straight away: an admin pressed "Publish"
 * before the check had run (D-056).
 */
export async function validateProblem(
  problemId: string,
  now = () => new Date(),
  publishBy?: string,
): Promise<void> {
  const problem = await db.problem.findUnique({
    where: { id: problemId },
    include: {
      testCases: { orderBy: { order: "asc" } },
      solutions: { where: { kind: { not: "STARTER" } } },
    },
  });
  if (!problem) return;
  const report = await checkProblem(problem);
  // The judge can take a while. If the problem changed meanwhile (every edit that affects the
  // check updates the row and queues its own check), this result is stale: drop it.
  const saved = await db.problem.updateMany({
    where: { id: problem.id, updatedAt: problem.updatedAt },
    data: { validatedAt: report.ok ? now() : null, validationNote: report.lines.join("\n") },
  });
  if (!saved.count) return;
  // Same publish rules (and audit) as the Publish button, as the admin who asked for it.
  if (report.ok && publishBy) {
    const actor = await db.user.findUnique({
      where: { id: publishBy },
      select: { id: true, roles: true },
    });
    if (actor) await transitionProblem(problem.id, "publish", actor);
  }
}

export const MIN_SAMPLES = 1;
export const MIN_HIDDEN = 5;

export async function checkProblem(problem: {
  timeLimitMs: number;
  memoryLimitMb: number;
  checker: string;
  testCases: { input: string; output: string; isSample: boolean }[];
  solutions: { kind: string; language: string; code: string }[];
}): Promise<{ ok: boolean; lines: string[] }> {
  const lines: string[] = [];
  let ok = true;
  const samples = problem.testCases.filter((t) => t.isSample).length;
  const hidden = problem.testCases.length - samples;
  if (samples < MIN_SAMPLES || hidden < MIN_HIDDEN) {
    ok = false;
    lines.push(
      `✗ Needs ${MIN_SAMPLES}+ sample and ${MIN_HIDDEN}+ hidden tests (has ${samples} and ${hidden}).`,
    );
  }
  if (!problem.solutions.some((s) => s.kind === "REFERENCE")) {
    ok = false;
    lines.push("✗ No reference solution.");
  }
  if (!ok) return { ok, lines };

  const judge = getJudge();
  for (const solution of problem.solutions) {
    const name = `${solution.kind.toLowerCase()} (${solution.language})`;
    if (!isCodingLanguage(solution.language)) {
      ok = false;
      lines.push(`✗ ${name}: unsupported language.`);
      continue;
    }
    const result = await evaluate(judge, {
      language: solution.language,
      code: solution.code,
      limits: { timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb },
      checker: problem.checker,
      scoring: "PER_TEST",
      tests: problem.testCases,
    });
    if (result.verdict === "ACCEPTED") {
      const limit = effectiveTimeLimit(solution.language, problem.timeLimitMs);
      const slow = (result.runtimeMs ?? 0) > limit / 2;
      lines.push(
        `✓ ${name}: ${result.passed}/${result.total} tests, slowest ${result.runtimeMs} ms` +
          (slow ? ` — over half the ${limit} ms limit; consider raising time_limit_ms.` : "."),
      );
    } else {
      ok = false;
      const failed = result.results.find((r) => r.verdict !== "ACCEPTED");
      lines.push(
        result.compileOutput
          ? `✗ ${name}: doesn't compile — ${result.compileOutput.split("\n")[0]}`
          : `✗ ${name}: ${result.verdict.replaceAll("_", " ").toLowerCase()} on test ${(failed?.index ?? 0) + 1} (${result.passed}/${result.total} passed).`,
      );
    }
  }
  return { ok, lines };
}
