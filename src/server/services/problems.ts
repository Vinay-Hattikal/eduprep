import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type {
  ContentSource,
  ContentStatus,
  Difficulty,
  ScoringMode,
  SolutionKind,
} from "@/generated/prisma/enums";
import { isValidChecker } from "@/lib/coding/checker";
import {
  nextStatus,
  transitionBlocker,
  type Actor,
  type ContentAction,
} from "@/lib/content/workflow";
import { db } from "@/server/db";
import { enqueueJob } from "@/server/jobs/queue";
import { recordAudit } from "@/server/services/audit";
import { touchCompaniesListing } from "@/server/services/company-links";

export const PROBLEM_PAGE_SIZE = 25;

export type ProblemFilters = {
  q?: string;
  status?: ContentStatus;
  difficulty?: Difficulty;
  validation?: "passed" | "pending";
  page: number;
};

export async function listAdminProblems(filters: ProblemFilters) {
  const where: Prisma.ProblemWhereInput = {
    ...(filters.q && {
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { externalId: { contains: filters.q, mode: "insensitive" } },
      ],
    }),
    ...(filters.status && { status: filters.status }),
    ...(filters.difficulty && { difficulty: filters.difficulty }),
    ...(filters.validation === "passed" && { validatedAt: { not: null } }),
    ...(filters.validation === "pending" && { validatedAt: null }),
  };
  const [rows, total] = await Promise.all([
    db.problem.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (filters.page - 1) * PROBLEM_PAGE_SIZE,
      take: PROBLEM_PAGE_SIZE,
      select: {
        id: true,
        externalId: true,
        slug: true,
        title: true,
        difficulty: true,
        status: true,
        validatedAt: true,
        validationNote: true,
        updatedAt: true,
        _count: { select: { testCases: true, solutions: true, submissions: true } },
      },
    }),
    db.problem.count({ where }),
  ]);
  return { rows, total };
}

export async function getAdminProblem(id: string) {
  const problem = await db.problem.findUnique({
    where: { id },
    include: {
      topics: { select: { id: true, name: true, slug: true } },
      testCases: { orderBy: { order: "asc" } },
      solutions: { orderBy: [{ kind: "asc" }, { language: "asc" }] },
      companies: {
        select: { companyId: true, askedIn: true, company: { select: { name: true, slug: true } } },
      },
      author: { select: { name: true } },
      reviewer: { select: { name: true } },
    },
  });
  if (!problem) return null;
  const [submissions, accepted, pendingValidation] = await Promise.all([
    db.submission.count({ where: { problemId: id, kind: "SUBMIT" } }),
    db.submission.count({ where: { problemId: id, kind: "SUBMIT", verdict: "ACCEPTED" } }),
    db.job.count({
      where: {
        type: "problem.validate",
        status: { in: ["QUEUED", "RUNNING"] },
        payload: { path: ["problemId"], equals: id },
      },
    }),
  ]);
  return { ...problem, stats: { submissions, accepted }, validating: pendingValidation > 0 };
}

// ---------- Editing ----------

/** Every field of the problem form. `id` is missing when creating. */
export type ProblemValues = {
  id?: string;
  externalId: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  topicIds: string[];
  languages: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  scoring: ScoringMode;
  checker: string;
  source: ContentSource;
  hints: string[];
  editorial: string | null;
};

export type ProblemSaveResult =
  | {
      ok: true;
      id: string;
      created: boolean;
      movedToDraft: boolean;
      revalidating: boolean;
      /** After the save: published still, and whether the judge check still holds. */
      published: boolean;
      validated: boolean;
    }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

const JUDGED_FIELDS = ["timeLimitMs", "memoryLimitMb", "checker"] as const;

/** Topics a coding problem can use: the topics of the DSA subject (same rule as the importer). */
export async function listDsaTopics() {
  return db.topic.findMany({
    where: { subject: { slug: "dsa" } },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });
}

/**
 * Creates a draft problem, or updates one. Edits never stay published (D-010): the problem goes
 * back to draft. Changing limits or the checker re-runs the judge check (D-034).
 */
export async function saveProblem(
  values: ProblemValues,
  actor: Actor,
  /** "Save and publish": a judge check this save triggers also publishes when it passes. */
  { publishAfterCheck = false } = {},
): Promise<ProblemSaveResult> {
  const fieldErrors: Record<string, string> = {};
  if (!isValidChecker(values.checker))
    fieldErrors.checker = "Use exact, ignore_whitespace or float:1e-6.";

  const [before, sameId, sameSlug, dsaTopics] = await Promise.all([
    values.id
      ? db.problem.findUnique({
          where: { id: values.id },
          include: {
            topics: { select: { id: true } },
            solutions: { select: { kind: true, language: true } },
          },
        })
      : null,
    db.problem.findUnique({ where: { externalId: values.externalId }, select: { id: true } }),
    db.problem.findUnique({ where: { slug: values.slug }, select: { id: true } }),
    db.topic.findMany({
      where: { id: { in: values.topicIds }, subject: { slug: "dsa" } },
      select: { id: true },
    }),
  ]);
  if (values.id && !before)
    return { ok: false, fieldErrors: {}, formError: "This problem no longer exists." };
  if (sameId && sameId.id !== values.id) fieldErrors.externalId = "This ID is already used.";
  if (sameSlug && sameSlug.id !== values.id) fieldErrors.slug = "This URL slug is already used.";
  if (dsaTopics.length !== new Set(values.topicIds).size)
    fieldErrors.topicIds = "Choose topics from the DSA subject.";
  const orphanStarters = (before?.solutions ?? []).filter(
    (s) => s.kind === "STARTER" && !values.languages.includes(s.language),
  );
  if (orphanStarters.length)
    fieldErrors.languages = `Delete the ${orphanStarters.map((s) => s.language).join(", ")} starter code first.`;
  if (Object.keys(fieldErrors).length)
    return { ok: false, fieldErrors, formError: "Fix the highlighted fields." };

  const { id: _id, topicIds, ...data } = values;
  const topics = [...new Set(topicIds)].sort().map((id) => ({ id }));

  if (!before) {
    const problem = await db.$transaction(async (tx) => {
      const created = await tx.problem.create({
        data: { ...data, status: "DRAFT", authorId: actor.id, topics: { connect: topics } },
      });
      await recordAudit(
        {
          actorId: actor.id,
          action: "problem.create",
          entityType: "problem",
          entityId: created.id,
          after: { externalId: created.externalId },
        },
        tx,
      );
      return created;
    });
    return {
      ok: true,
      id: problem.id,
      created: true,
      movedToDraft: false,
      revalidating: false,
      published: false,
      validated: false,
    };
  }

  const changed: string[] = (Object.keys(data) as (keyof typeof data)[]).filter(
    (key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(data[key] ?? null),
  );
  const beforeTopics = before.topics.map((t) => t.id).sort();
  if (JSON.stringify(beforeTopics) !== JSON.stringify(topics.map((t) => t.id)))
    changed.push("topics");
  if (!changed.length)
    return {
      ok: true,
      id: before.id,
      created: false,
      movedToDraft: false,
      revalidating: false,
      published: before.status === "PUBLISHED",
      validated: Boolean(before.validatedAt),
    };

  const revalidating = changed.some((key) => (JUDGED_FIELDS as readonly string[]).includes(key));
  const movedToDraft = before.status !== "DRAFT";
  await db.$transaction(async (tx) => {
    await tx.problem.update({
      where: { id: before.id },
      data: {
        ...data,
        topics: { set: topics },
        status: "DRAFT",
        version: before.version + 1,
        ...(movedToDraft && { reviewerId: null, publishedAt: null }),
        ...(revalidating && { validatedAt: null, validationNote: null }),
      },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "problem.update",
        entityType: "problem",
        entityId: before.id,
        after: { changed },
      },
      tx,
    );
  });
  if (revalidating)
    await enqueueJob("problem.validate", {
      problemId: before.id,
      ...(publishAfterCheck && { publishBy: actor.id }),
    });
  return {
    ok: true,
    id: before.id,
    created: false,
    movedToDraft,
    revalidating,
    published: false,
    validated: Boolean(before.validatedAt) && !revalidating,
  };
}

// ---------- Solutions ----------

export type SolutionInput = {
  problemId: string;
  kind: SolutionKind;
  language: string;
  code: string;
};

/**
 * Adds or replaces the problem's code for one kind and language. Reference and brute-force code
 * decide what the judge accepts, so they re-run the judge check. Starter code is only what
 * students see first, so it doesn't; like any edit, it still sends the problem back to draft.
 */
export async function saveSolution(
  values: SolutionInput,
  actor: Actor,
): Promise<{ ok: true; revalidating: boolean } | { ok: false; error: string }> {
  const problem = await db.problem.findUnique({
    where: { id: values.problemId },
    select: { status: true, languages: true },
  });
  if (!problem) return { ok: false, error: "This problem no longer exists." };
  if (problem.status === "ARCHIVED") return { ok: false, error: "Restore the problem first." };
  if (values.kind === "STARTER" && !problem.languages.includes(values.language))
    return {
      ok: false,
      error: `This problem doesn't allow ${values.language}. Add it to the languages first.`,
    };

  const judged = values.kind !== "STARTER";
  await db.$transaction(async (tx) => {
    const key = {
      problemId: values.problemId,
      kind: values.kind,
      language: values.language,
    };
    await tx.problemSolution.upsert({
      where: { problemId_kind_language: key },
      create: { ...key, code: values.code },
      update: { code: values.code },
    });
    await markChanged(tx, values.problemId, { clearValidation: judged });
    await recordAudit(
      {
        actorId: actor.id,
        action: "problem.solution_save",
        entityType: "problem",
        entityId: values.problemId,
        after: { kind: values.kind, language: values.language },
      },
      tx,
    );
  });
  if (judged) await enqueueJob("problem.validate", { problemId: values.problemId });
  return { ok: true, revalidating: judged };
}

export async function deleteSolution(problemId: string, solutionId: string, actor: Actor) {
  const solution = await db.problemSolution.findFirst({ where: { id: solutionId, problemId } });
  if (!solution) return { revalidating: false };
  const judged = solution.kind !== "STARTER";
  await db.$transaction(async (tx) => {
    await tx.problemSolution.delete({ where: { id: solution.id } });
    await markChanged(tx, problemId, { clearValidation: judged });
    await recordAudit(
      {
        actorId: actor.id,
        action: "problem.solution_delete",
        entityType: "problem",
        entityId: problemId,
        before: { kind: solution.kind, language: solution.language },
      },
      tx,
    );
  });
  if (judged) await enqueueJob("problem.validate", { problemId });
  return { revalidating: judged };
}

export type TestCaseInput = {
  problemId: string;
  isSample: boolean;
  input: string;
  output: string;
  explanation: string | null;
};

/** Adds one test at the end. Tests change the judge's answer, so the problem is re-checked. */
export async function addTestCase(values: TestCaseInput, actor: Actor) {
  const last = await db.problemTestCase.findFirst({
    where: { problemId: values.problemId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  await db.$transaction(async (tx) => {
    const test = await tx.problemTestCase.create({
      data: {
        ...values,
        input: values.input.replace(/\r\n/g, "\n"),
        output: values.output.replace(/\r\n/g, "\n"),
        order: (last?.order ?? 0) + 1,
      },
    });
    await markChanged(tx, values.problemId);
    await recordAudit(
      {
        actorId: actor.id,
        action: "problem.test_add",
        entityType: "problem",
        entityId: values.problemId,
        after: { testId: test.id },
      },
      tx,
    );
  });
  await enqueueJob("problem.validate", { problemId: values.problemId });
}

export async function deleteTestCase(problemId: string, testId: string, actor: Actor) {
  await db.$transaction(async (tx) => {
    const removed = await tx.problemTestCase.deleteMany({ where: { id: testId, problemId } });
    if (!removed.count) return;
    await markChanged(tx, problemId);
    await recordAudit(
      {
        actorId: actor.id,
        action: "problem.test_delete",
        entityType: "problem",
        entityId: problemId,
        after: { testId },
      },
      tx,
    );
  });
  await enqueueJob("problem.validate", { problemId });
}

async function markChanged(
  tx: Prisma.TransactionClient,
  problemId: string,
  { clearValidation = true } = {},
) {
  const problem = await tx.problem.findUniqueOrThrow({
    where: { id: problemId },
    select: { status: true, version: true },
  });
  await tx.problem.update({
    where: { id: problemId },
    data: {
      ...(clearValidation && { validatedAt: null, validationNote: null }),
      version: problem.version + 1,
      ...(problem.status !== "DRAFT" && { status: "DRAFT", reviewerId: null, publishedAt: null }),
    },
  });
}

export async function requestValidation(problemId: string, publishBy?: string) {
  await db.problem.update({ where: { id: problemId }, data: { validationNote: null } });
  await enqueueJob("problem.validate", { problemId, ...(publishBy && { publishBy }) });
}

// ---------- Workflow ----------

export async function transitionProblem(
  id: string,
  action: ContentAction,
  actor: Actor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const problem = await db.problem.findUnique({ where: { id } });
  if (!problem) return { ok: false, error: "This problem no longer exists." };
  const blocker = transitionBlocker(action, problem.status, actor);
  if (blocker) return { ok: false, error: blocker };
  // D-034: only problems whose reference solutions pass every test reach students.
  if (action === "publish" && !problem.validatedAt) {
    return {
      ok: false,
      error: "Check the problem in the judge first: every reference solution must pass every test.",
    };
  }

  const status = nextStatus(action);
  await db.$transaction(async (tx) => {
    await tx.problem.update({
      where: { id },
      data: {
        status,
        ...(action === "publish" && {
          publishedAt: new Date(),
          reviewerId: actor.id,
          reviewNote: null,
        }),
      },
    });
    if (action === "publish" || problem.status === "PUBLISHED")
      await touchCompaniesListing(tx, { problemId: id });
    await recordAudit(
      {
        actorId: actor.id,
        action: `problem.${action}`,
        entityType: "problem",
        entityId: id,
        before: { status: problem.status },
        after: { status },
      },
      tx,
    );
  });
  return { ok: true };
}
