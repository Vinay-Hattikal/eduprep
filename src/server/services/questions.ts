import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ContentStatus, Difficulty, QuestionType } from "@/generated/prisma/enums";
import { checkQuestion, hasErrors, type Issue } from "@/lib/content/question-rules";
import {
  nextStatus,
  transitionBlocker,
  type Actor,
  type QuestionAction,
} from "@/lib/content/workflow";
import type { QuestionFormValues } from "@/schemas/question";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";
import {
  changedFields,
  pickContent,
  toSnapshot,
  type QuestionContentFields,
} from "@/server/services/question-snapshot";

export const PAGE_SIZE = 25;

export type QuestionFilters = {
  q?: string;
  subject?: string;
  topic?: string;
  status?: ContentStatus;
  difficulty?: Difficulty;
  type?: QuestionType;
  page?: number;
};

export async function listQuestions(filters: QuestionFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const where: Prisma.QuestionWhereInput = {
    ...(filters.q
      ? {
          OR: [
            { text: { contains: filters.q, mode: "insensitive" } },
            { externalId: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filters.subject ? { subject: { slug: filters.subject } } : {}),
    ...(filters.topic ? { topic: { slug: filters.topic } } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  };

  const [items, total] = await Promise.all([
    db.question.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { externalId: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        externalId: true,
        text: true,
        type: true,
        difficulty: true,
        status: true,
        updatedAt: true,
        subject: { select: { name: true } },
        topic: { select: { name: true } },
      },
    }),
    db.question.count({ where }),
  ]);
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getQuestion(id: string) {
  return db.question.findUnique({
    where: { id },
    include: {
      subject: { select: { id: true, name: true, slug: true } },
      topic: { select: { id: true, name: true, slug: true } },
      subtopic: { select: { id: true, name: true } },
      passage: { select: { externalId: true, title: true, body: true } },
      author: { select: { name: true } },
      reviewer: { select: { name: true } },
      companies: { include: { company: { select: { name: true, slug: true } } } },
    },
  });
}

export async function getQuestionHistory(id: string) {
  const versions = await db.contentVersion.findMany({
    where: { entityType: "question", entityId: id },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    take: 30,
    include: { createdBy: { select: { name: true } } },
  });
  return versions.map((version, index) => {
    const older = versions[index + 1];
    const changes = older
      ? changedFields(
          older.snapshot as Partial<QuestionContentFields>,
          version.snapshot as Partial<QuestionContentFields>,
        )
      : [];
    return {
      id: version.id,
      version: version.version,
      reason: version.reason,
      createdAt: version.createdAt,
      createdBy: version.createdBy?.name ?? null,
      status: (version.snapshot as { status?: ContentStatus }).status ?? null,
      changes,
    };
  });
}

/** Subjects with topics and subtopics, for the editor's pickers and filters. */
export async function getTaxonomyTree() {
  return db.subject.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
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
            select: { id: true, name: true },
          },
        },
      },
    },
  });
}

export type SaveResult =
  | { ok: true; id: string; movedToDraft: boolean }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string; warnings?: Issue[] };

/** Creates or updates a question from the editor. Content changes add a version. */
export async function saveQuestion(values: QuestionFormValues, actor: Actor): Promise<SaveResult> {
  const fieldErrors: Record<string, string> = {};

  const topic = await db.topic.findUnique({
    where: { id: values.topicId },
    select: { subjectId: true },
  });
  if (!topic || topic.subjectId !== values.subjectId)
    fieldErrors.topicId = "Choose a topic from this subject.";
  if (values.subtopicId) {
    const subtopic = await db.subtopic.findUnique({
      where: { id: values.subtopicId },
      select: { topicId: true },
    });
    if (!subtopic || subtopic.topicId !== values.topicId)
      fieldErrors.subtopicId = "Choose a subtopic of this topic.";
  }
  let passageId: string | null = null;
  if (values.passageExternalId) {
    const passage = await db.passage.findUnique({
      where: { externalId: values.passageExternalId },
    });
    if (!passage) fieldErrors.passageExternalId = "No passage with this ID.";
    passageId = passage?.id ?? null;
  }

  const numeric = values.type === "NUMERIC";
  const options = numeric
    ? []
    : values.options.slice(0, values.options.findLastIndex((o) => o.trim()) + 1);
  const content: QuestionContentFields = {
    subjectId: values.subjectId,
    topicId: values.topicId,
    subtopicId: values.subtopicId,
    type: values.type,
    text: values.text.trim(),
    code: values.code,
    codeLanguage: values.code ? values.codeLanguage : null,
    options: options.map((o) => o.trim()),
    correctOptions: numeric ? [] : values.correctOptions,
    numericAnswer: numeric ? values.numericAnswer : null,
    tolerance: numeric ? (values.tolerance ?? 0) : null,
    explanation: values.explanation.trim(),
    difficulty: values.difficulty,
    expectedTimeSec: values.expectedTimeSec,
    passageId,
    tags: values.tags,
    source: values.source,
  };

  const issues = checkQuestion({ ...content, options: numeric ? values.options : content.options });
  for (const issue of issues.filter((i) => i.level === "error"))
    fieldErrors[issue.field] ??= issue.message;
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  if (!values.id) {
    const taken = await db.question.findUnique({ where: { externalId: values.externalId } });
    if (taken) return { ok: false, fieldErrors: { externalId: "This ID is already used." } };

    const created = await db.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          ...content,
          externalId: values.externalId,
          authorId: actor.id,
          status: "DRAFT",
          version: 1,
        },
      });
      await tx.contentVersion.create({
        data: {
          entityType: "question",
          entityId: question.id,
          version: 1,
          snapshot: toSnapshot(question),
          reason: "created",
          createdById: actor.id,
        },
      });
      await recordAudit(
        {
          actorId: actor.id,
          action: "question.create",
          entityType: "question",
          entityId: question.id,
        },
        tx,
      );
      return question;
    });
    return { ok: true, id: created.id, movedToDraft: false };
  }

  const before = await db.question.findUnique({ where: { id: values.id } });
  if (!before) return { ok: false, fieldErrors: {}, formError: "This question no longer exists." };
  const changes = changedFields(pickContent(before), content);
  if (changes.length === 0) return { ok: true, id: before.id, movedToDraft: false };

  // Edits never stay published: the changed question goes back to draft for review (D-010).
  const movedToDraft = before.status !== "DRAFT";
  await db.$transaction(async (tx) => {
    const question = await tx.question.update({
      where: { id: before.id },
      data: {
        ...content,
        version: before.version + 1,
        status: "DRAFT",
        ...(movedToDraft ? { reviewerId: null, submittedAt: null, publishedAt: null } : {}),
      },
    });
    await tx.contentVersion.create({
      data: {
        entityType: "question",
        entityId: question.id,
        version: question.version,
        snapshot: toSnapshot(question),
        reason: "edited",
        createdById: actor.id,
      },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "question.update",
        entityType: "question",
        entityId: question.id,
        after: { changed: changes },
      },
      tx,
    );
  });
  return { ok: true, id: before.id, movedToDraft };
}

export type TransitionResult = { ok: true } | { ok: false; error: string };

const HISTORY_REASONS: Record<QuestionAction, string> = {
  submit: "submitted for review",
  approve: "published",
  reject: "sent back",
  archive: "archived",
  restore: "restored",
};

/** Moves a question through the review workflow. Submitting runs the automatic checks again. */
export async function transitionQuestion(
  id: string,
  action: QuestionAction,
  actor: Actor,
  note?: string,
): Promise<TransitionResult> {
  const question = await db.question.findUnique({ where: { id } });
  if (!question) return { ok: false, error: "This question no longer exists." };

  const blocker = transitionBlocker(action, question.status, actor, question.authorId);
  if (blocker) return { ok: false, error: `${question.externalId}: ${blocker}` };
  if (action === "submit" && hasErrors(checkQuestion(question))) {
    return {
      ok: false,
      error: `${question.externalId} fails the automatic checks. Open it and fix the errors.`,
    };
  }
  if (action === "reject" && !note?.trim())
    return { ok: false, error: "Say what needs to change." };

  const status = nextStatus(action);
  const now = new Date();
  const data: Prisma.QuestionUpdateInput = {
    status,
    ...(action === "submit" ? { submittedAt: now, reviewNote: null } : {}),
    ...(action === "approve"
      ? { publishedAt: now, reviewer: { connect: { id: actor.id } }, reviewNote: null }
      : {}),
    ...(action === "reject"
      ? { reviewNote: note!.trim(), reviewer: { connect: { id: actor.id } } }
      : {}),
  };

  await db.$transaction(async (tx) => {
    const updated = await tx.question.update({ where: { id }, data });
    await tx.contentVersion.create({
      data: {
        entityType: "question",
        entityId: id,
        version: updated.version,
        snapshot: toSnapshot(updated),
        reason: HISTORY_REASONS[action],
        createdById: actor.id,
      },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: `question.${action}`,
        entityType: "question",
        entityId: id,
        before: { status: question.status },
        after: { status, ...(note ? { note } : {}) },
      },
      tx,
    );
  });
  return { ok: true };
}

export async function bulkTransition(ids: string[], action: QuestionAction, actor: Actor) {
  let done = 0;
  const errors: string[] = [];
  for (const id of ids.slice(0, 200)) {
    const result = await transitionQuestion(id, action, actor);
    if (result.ok) done += 1;
    else errors.push(result.error);
  }
  return { done, errors };
}
