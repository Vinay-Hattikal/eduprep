import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ContentStatus, Difficulty, QuestionType } from "@/generated/prisma/enums";
import { checkQuestion, filledOptions, hasErrors, type Issue } from "@/lib/content/question-rules";
import {
  nextStatus,
  transitionBlocker,
  type Actor,
  type ContentAction,
} from "@/lib/content/workflow";
import type { QuestionFormValues } from "@/schemas/question";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";
import { touchCompaniesListing } from "@/server/services/company-links";
import { getSetting } from "@/server/services/settings";
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
        publicSample: true,
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
  /** `published`: still live after the save (only when nothing changed). */
  | { ok: true; id: string; movedToDraft: boolean; published: boolean }
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
  const options = numeric ? [] : filledOptions(values.options);
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
    return { ok: true, id: created.id, movedToDraft: false, published: false };
  }

  const before = await db.question.findUnique({ where: { id: values.id } });
  if (!before) return { ok: false, fieldErrors: {}, formError: "This question no longer exists." };
  const changes = changedFields(pickContent(before), content);
  if (changes.length === 0)
    return {
      ok: true,
      id: before.id,
      movedToDraft: false,
      published: before.status === "PUBLISHED",
    };

  // A plain save unpublishes a changed question; "Save and publish" puts it back (D-056).
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
  return { ok: true, id: before.id, movedToDraft, published: false };
}

export type TransitionResult = { ok: true } | { ok: false; error: string };

const HISTORY_REASONS: Record<ContentAction, string> = {
  publish: "published",
  unpublish: "unpublished",
  archive: "archived",
  restore: "restored",
};

type QuestionRow = Awaited<ReturnType<typeof db.question.findUniqueOrThrow>>;

/** Why this question can't be published because of its content, or null. */
export function questionCheckError(question: QuestionRow) {
  return hasErrors(checkQuestion(question))
    ? `${question.externalId} fails the automatic checks. Open it and fix the errors.`
    : null;
}

/** Why this question can't take the action, or null. */
function transitionError(question: QuestionRow, action: ContentAction, actor: Actor) {
  const blocker = transitionBlocker(action, question.status, actor);
  if (blocker) return `${question.externalId}: ${blocker}`;
  return action === "publish" ? questionCheckError(question) : null;
}

/** Publishes, unpublishes, archives or restores a question. Publishing runs the automatic checks. */
export async function transitionQuestion(
  id: string,
  action: ContentAction,
  actor: Actor,
): Promise<TransitionResult> {
  const question = await db.question.findUnique({ where: { id } });
  if (!question) return { ok: false, error: "This question no longer exists." };
  const error = transitionError(question, action, actor);
  if (error) return { ok: false, error };
  if (action === "publish") {
    const stale = await publishChecked([question], actor);
    return stale.length
      ? { ok: false, error: `${question.externalId} changed while publishing. Try again.` }
      : { ok: true };
  }

  const status = nextStatus(action);
  await db.$transaction(async (tx) => {
    const updated = await tx.question.update({ where: { id }, data: { status } });
    // Unpublishing changes the company pages that list it (D-058).
    if (question.status === "PUBLISHED") await touchCompaniesListing(tx, { questionId: id });
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
        after: { status },
      },
      tx,
    );
  });
  return { ok: true };
}

/**
 * Publishes many questions with the same rules as one at a time (imports, bulk actions), in a
 * few queries per 500 questions instead of several per question. Returns why the rest didn't.
 */
export async function publishQuestions(ids: readonly string[], actor: Actor) {
  const unique = [...new Set(ids)];
  const questions = await db.question.findMany({
    where: { id: { in: unique } },
    orderBy: { externalId: "asc" },
  });
  const errors: string[] = [];
  if (questions.length < unique.length)
    errors.push(`${unique.length - questions.length} question(s) no longer exist.`);
  const ready: QuestionRow[] = [];
  for (const question of questions) {
    const error = transitionError(question, "publish", actor);
    if (error) errors.push(error);
    else ready.push(question);
  }
  const stale = await publishChecked(ready, actor);
  for (const question of stale)
    errors.push(`${question.externalId} changed while publishing. Try again.`);
  return { done: ready.length - stale.length, errors };
}

const PUBLISH_CHUNK = 500;

/**
 * Publishes questions that already passed transitionError. Returns the ones skipped because
 * they changed after the check (edited or archived while a large publish was running).
 */
async function publishChecked(
  questions: readonly QuestionRow[],
  actor: Actor,
): Promise<QuestionRow[]> {
  const stale: QuestionRow[] = [];
  if (!questions.length) return stale;
  const samplesPerTopic = await getSetting("seo.publicSamplesPerTopic");
  for (let i = 0; i < questions.length; i += PUBLISH_CHUNK) {
    const checked = questions.slice(i, i + PUBLISH_CHUNK);
    await db.$transaction(
      async (tx) => {
        // One publish at a time, so two can't both count a topic's samples before either
        // commits; and only rows unchanged since they were checked, locked until commit.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('question.publish'))`;
        const current = await tx.$queryRaw<{ id: string; updated_at: Date }[]>`
          SELECT id, updated_at FROM questions
           WHERE id = ANY(${checked.map((q) => q.id)}) FOR UPDATE`;
        const version = new Map(current.map((r) => [r.id, r.updated_at.getTime()]));
        const chunk: QuestionRow[] = [];
        for (const q of checked)
          (version.get(q.id) === q.updatedAt.getTime() ? chunk : stale).push(q);
        if (!chunk.length) return;
        const ids = chunk.map((q) => q.id);
        const samples = await pickPublicSamples(tx, chunk, samplesPerTopic);
        const data = {
          status: "PUBLISHED" as const,
          publishedAt: new Date(),
          reviewerId: actor.id,
          reviewNote: null,
        };
        const asSample = ids.filter((id) => samples.has(id));
        const rest = ids.filter((id) => !samples.has(id));
        if (asSample.length)
          await tx.question.updateMany({
            where: { id: { in: asSample } },
            data: { ...data, publicSample: true },
          });
        if (rest.length) await tx.question.updateMany({ where: { id: { in: rest } }, data });

        await tx.contentVersion.createMany({
          data: chunk.map((q) => ({
            entityType: "question",
            entityId: q.id,
            version: q.version,
            snapshot: toSnapshot({ ...q, ...data }),
            reason: HISTORY_REASONS.publish,
            createdById: actor.id,
          })),
        });
        await tx.auditLog.createMany({
          data: chunk.map((q) => ({
            actorId: actor.id,
            action: "question.publish",
            entityType: "question",
            entityId: q.id,
            before: { status: q.status },
            after: { status: "PUBLISHED" },
          })),
        });
        // Publishing changes the company pages that list them (D-058).
        await touchCompaniesListing(tx, { questionId: { in: ids } });
      },
      { timeout: 60_000 },
    );
  }
  return stale;
}

/**
 * Public samples (D-058): a newly published question shows its answer without sign-in until
 * its topic has `perTopic` public samples. Only on the first publish, and never after an admin
 * set the box by hand: a question made private on purpose stays private when republished.
 */
async function pickPublicSamples(
  tx: Prisma.TransactionClient,
  questions: readonly QuestionRow[],
  perTopic: number,
): Promise<Set<string>> {
  const candidates = perTopic > 0 ? questions.filter((q) => !q.publicSample) : [];
  if (!candidates.length) return new Set();
  const [counts, decided] = await Promise.all([
    tx.question.groupBy({
      by: ["topicId"],
      where: {
        topicId: { in: [...new Set(candidates.map((q) => q.topicId))] },
        publicSample: true,
        status: "PUBLISHED",
      },
      _count: { _all: true },
    }),
    tx.auditLog.findMany({
      where: {
        entityType: "question",
        entityId: { in: candidates.map((q) => q.id) },
        action: { in: ["question.publish", "question.public_sample", "question.private_answer"] },
      },
      select: { entityId: true },
      distinct: ["entityId"],
    }),
  ]);
  const have = new Map(counts.map((c) => [c.topicId, c._count._all]));
  const skip = new Set(decided.map((d) => d.entityId));
  const picked = new Set<string>();
  for (const q of candidates) {
    const count = have.get(q.topicId) ?? 0;
    if (skip.has(q.id) || count >= perTopic) continue;
    picked.add(q.id);
    have.set(q.topicId, count + 1);
  }
  return picked;
}

/** Marks a question as a public sample (answer shown without sign-in) or not (D-058). */
export async function setPublicSample(id: string, value: boolean, actor: Actor) {
  const question = await db.question.findUnique({
    where: { id },
    select: { publicSample: true, externalId: true },
  });
  if (!question || question.publicSample === value) return false;
  await db.$transaction(async (tx) => {
    await tx.question.update({ where: { id }, data: { publicSample: value } });
    await recordAudit(
      {
        actorId: actor.id,
        action: value ? "question.public_sample" : "question.private_answer",
        entityType: "question",
        entityId: id,
      },
      tx,
    );
  });
  return true;
}

export async function bulkPublicSample(ids: string[], value: boolean, actor: Actor) {
  const changing = await db.question.findMany({
    where: { id: { in: ids.slice(0, 200) }, publicSample: !value },
    select: { id: true },
  });
  if (!changing.length) return 0;
  const changed = changing.map((q) => q.id);
  await db.$transaction([
    db.question.updateMany({ where: { id: { in: changed } }, data: { publicSample: value } }),
    db.auditLog.createMany({
      data: changed.map((entityId) => ({
        actorId: actor.id,
        action: value ? "question.public_sample" : "question.private_answer",
        entityType: "question",
        entityId,
      })),
    }),
  ]);
  return changed.length;
}

export async function bulkTransition(ids: string[], action: ContentAction, actor: Actor) {
  const batch = ids.slice(0, 200);
  if (action === "publish") return publishQuestions(batch, actor);
  let done = 0;
  const errors: string[] = [];
  for (const id of batch) {
    const result = await transitionQuestion(id, action, actor);
    if (result.ok) done += 1;
    else errors.push(result.error);
  }
  return { done, errors };
}
