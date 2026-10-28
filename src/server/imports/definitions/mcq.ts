// MCQ import: one CSV per subject, standard columns (data-import.md 4.3).

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { ContentSource, Difficulty, QuestionType } from "@/generated/prisma/enums";
import { findAssetReferences, rewriteAssetLinks } from "@/lib/content/assets";
import {
  checkQuestion,
  CODE_LANGUAGES,
  normalizeQuestionText,
  OPTION_LETTERS,
} from "@/lib/content/question-rules";
import { assetUrls, checkAssetReferences, hashAssets, storeAssets } from "@/server/imports/assets";
import { CellReader } from "@/server/imports/cells";
import {
  COMPANY_LINK_COLUMNS,
  hasCompanyColumn,
  linksChanged,
  loadCompanySlugs,
  readCompanyLinks,
  warnUnlinked,
  writeCompanyLinks,
  type CompanyLinks,
  type ExistingLink,
} from "@/server/imports/company-links";
import { todayUtc } from "@/server/imports/definitions/companies";
import { toCsv, type ParsedFile, type ParsedRow } from "@/server/imports/parse";
import {
  finishRow,
  sameValues,
  type DbReader,
  type ImportDefinition,
  type ValidatedRow,
} from "@/server/imports/types";
import {
  fromSnapshot,
  pickContent,
  toSnapshot,
  type QuestionContentFields,
  type QuestionRecord,
} from "@/server/services/question-snapshot";

export const MCQ_COLUMNS = [
  // Optional (D-054): a blank ID is matched to the same question already saved, or gets a
  // stable ID made from the question's content.
  { name: "external_id", required: false },
  { name: "subject", required: true },
  { name: "topic", required: true },
  { name: "subtopic", required: false },
  { name: "type", required: true },
  { name: "question", required: true },
  { name: "code", required: false },
  { name: "code_language", required: false },
  { name: "option_a", required: false },
  { name: "option_b", required: false },
  { name: "option_c", required: false },
  { name: "option_d", required: false },
  { name: "option_e", required: false },
  { name: "correct", required: true },
  { name: "tolerance", required: false },
  { name: "explanation", required: true },
  { name: "difficulty", required: true },
  { name: "expected_time_sec", required: true },
  { name: "passage_id", required: false },
  { name: "tags", required: false },
  { name: "source", required: true },
  ...COMPANY_LINK_COLUMNS,
] as const;

export type McqValue = QuestionContentFields & {
  externalId: string;
  links?: CompanyLinks;
  /** False when only the company links changed: the question itself isn't touched. */
  contentChanged?: boolean;
};

type ExistingQuestion = QuestionRecord & { id: string; externalId: string; subjectSlug: string };

/**
 * What makes two questions the same question: text, options, code and passage. Used to block exact
 * duplicates and to give rows without an ID a stable one.
 */
export function mcqContentKey(q: {
  text: string;
  options: readonly string[];
  code: string | null;
  passage: string | null;
}): string {
  return [
    normalizeQuestionText(q.text),
    q.options.map((o) => normalizeQuestionText(o)).join("\u0001"),
    normalizeQuestionText(q.code ?? ""),
    q.passage ?? "",
  ].join("\u0000");
}

/** Stable ID for a row without one: the subject plus a hash of the content. */
export function derivedMcqId(subjectSlug: string, key: string): string {
  return `${subjectSlug.slice(0, 40)}-${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

export type McqContext = {
  subjects: Map<string, { id: string }>;
  topics: Map<string, { id: string; subjectSlug: string }>;
  /** Key: `${topicSlug}/${subtopicSlug}` */
  subtopics: Map<string, { id: string }>;
  passages: Map<string, { id: string }>;
  existing: Map<string, ExistingQuestion>;
  /** Average expected time per topic slug, when the topic has enough questions. */
  topicAverages: Map<string, number>;
  /** Most similar other question, if any is similar enough to be a likely duplicate. */
  findSimilar(
    text: string,
    externalId: string,
  ): Promise<{ externalId: string; score: number } | null>;
  /** mcqContentKey → externalId of saved questions (not archived) in the file's subject. */
  byContent?: Map<string, string>;
  /** Company tagging (company-links.ts). */
  companyColumn?: boolean;
  companies?: Map<string, { id: string }>;
  links?: Map<string, ExistingLink[]>;
  today?: Date;
};

const TYPES: Record<string, QuestionType> = {
  single: "SINGLE",
  multiple: "MULTIPLE",
  numeric: "NUMERIC",
};
const DIFFICULTIES: Record<string, Difficulty> = { easy: "EASY", medium: "MEDIUM", hard: "HARD" };
const SOURCES: Record<string, ContentSource> = {
  original: "ORIGINAL",
  "memory-based": "MEMORY_BASED",
};
const LANGUAGES = Object.fromEntries(CODE_LANGUAGES.map((l) => [l, l])) as Record<string, string>;

const SIMILARITY_THRESHOLD = 0.8;
const MIN_QUESTIONS_FOR_AVERAGE = 10;

/** Maps a question-rules field to the CSV column it came from. */
const FIELD_COLUMNS: Record<string, string> = {
  text: "question",
  explanation: "explanation",
  codeLanguage: "code_language",
  expectedTimeSec: "expected_time_sec",
  options: "option_a",
  numericAnswer: "correct",
  correctOptions: "correct",
  tolerance: "tolerance",
};

export async function validateMcqRows(
  rows: ParsedRow[],
  ctx: McqContext,
  assets: Map<string, Uint8Array>,
): Promise<ValidatedRow<McqValue>[]> {
  const urls = assetUrls(hashAssets(assets));
  const fileSubject = rows[0]?.cells.subject?.trim();
  const seenIds = new Map<string, number>();
  const seenTexts = new Map<string, number>();
  const seenContent = new Map<string, number>();
  const results: ValidatedRow<McqValue>[] = [];

  for (const row of rows) {
    const r = new CellReader(row.cells);

    const explicitId = r.optional("external_id");
    let externalId = explicitId === undefined ? undefined : r.externalId("external_id");

    const subjectSlug = r.slug("subject");
    const subject = subjectSlug ? ctx.subjects.get(subjectSlug) : undefined;
    if (subjectSlug && !subject)
      r.error("subject", `Unknown subject "${subjectSlug}". Import the taxonomy first.`);
    if (subjectSlug && fileSubject && subjectSlug !== fileSubject)
      r.error("subject", `Every row in a file must have the same subject ("${fileSubject}").`);

    const topicSlug = r.slug("topic");
    const topic = topicSlug ? ctx.topics.get(topicSlug) : undefined;
    if (topicSlug && !topic) r.error("topic", `Unknown topic "${topicSlug}".`);
    else if (topic && subjectSlug && topic.subjectSlug !== subjectSlug)
      r.error(
        "topic",
        `Topic "${topicSlug}" belongs to "${topic.subjectSlug}", not "${subjectSlug}".`,
      );

    const subtopicSlug = r.slug("subtopic", { required: false });
    const subtopic =
      subtopicSlug && topicSlug ? ctx.subtopics.get(`${topicSlug}/${subtopicSlug}`) : undefined;
    if (subtopicSlug && topic && !subtopic)
      r.error("subtopic", `Unknown subtopic "${subtopicSlug}" under "${topicSlug}".`);

    const type = r.choice("type", TYPES);
    const questionText = r.markdown("question");
    const code = r.markdown("code", { required: false });
    const codeLanguage = r.choice("code_language", LANGUAGES, { required: false });
    const options = OPTION_LETTERS.map(
      (letter) => r.markdown(`option_${letter.toLowerCase()}`, { required: false }) ?? "",
    );
    const lastFilled = options.findLastIndex(Boolean);
    const trimmedOptions = options.slice(0, lastFilled + 1);

    const correctRaw = r.required("correct");
    let correctOptions: string[] = [];
    let numericAnswer: number | null = null;
    if (correctRaw !== undefined && type) {
      if (type === "NUMERIC") {
        const n = Number(correctRaw);
        if (!/^-?\d+(\.\d+)?$/.test(correctRaw) || !Number.isFinite(n))
          r.error("correct", `"${correctRaw}" isn't a number.`);
        else numericAnswer = n;
      } else {
        correctOptions = correctRaw.split("|").map((part) => part.trim().toUpperCase());
        const bad = correctOptions.find((letter) => !OPTION_LETTERS.includes(letter as never));
        if (bad !== undefined) {
          r.error("correct", `"${correctRaw}" must be option letters like B or A|C.`);
          correctOptions = [];
        }
      }
    }
    const tolerance = r.float("tolerance", { required: false, min: 0 }) ?? null;
    const explanation = r.markdown("explanation");
    const difficulty = r.choice("difficulty", DIFFICULTIES);
    const expectedTimeSec = r.int("expected_time_sec");
    const passageExternalId = r.optional("passage_id");
    const passage = passageExternalId ? ctx.passages.get(passageExternalId) : undefined;
    if (passageExternalId && !passage)
      r.error("passage_id", `Passage "${passageExternalId}" doesn't exist. Import passages first.`);
    const tags = r.list("tags");
    const source = r.choice("source", SOURCES);

    for (const [column, markdown] of [
      ["question", questionText],
      ["explanation", explanation],
      ...trimmedOptions.map(
        (option, i) => [`option_${OPTION_LETTERS[i]!.toLowerCase()}`, option] as const,
      ),
    ] as const) {
      checkAssetReferences(r, column, markdown, assets);
    }

    // Shared rules (same as the editor and submit-for-review).
    if (
      type &&
      questionText !== undefined &&
      explanation !== undefined &&
      expectedTimeSec !== undefined
    ) {
      for (const issue of checkQuestion({
        type,
        text: questionText,
        code: code ?? null,
        codeLanguage: codeLanguage ?? null,
        options: type === "NUMERIC" ? options : trimmedOptions,
        correctOptions,
        numericAnswer,
        tolerance,
        explanation,
        expectedTimeSec,
      })) {
        const column = FIELD_COLUMNS[issue.field] ?? issue.field;
        if (issue.level === "error") r.error(column, issue.message);
        else r.warn(column, issue.message);
      }
    }

    // The ID (given, or matched/derived from the content) and exact duplicates.
    let exactDuplicate = false;
    if (questionText) {
      const key = mcqContentKey({
        text: questionText,
        options: type === "NUMERIC" ? [] : trimmedOptions,
        code: code ?? null,
        passage: passageExternalId ?? null,
      });
      const saved = ctx.byContent?.get(key);
      if (explicitId === undefined && subjectSlug)
        externalId = saved ?? derivedMcqId(subjectSlug, key);
      const firstRow = seenContent.get(key);
      if (firstRow) {
        r.error("question", `Same question as row ${firstRow}. This is a duplicate.`);
        exactDuplicate = true;
      } else {
        seenContent.set(key, row.rowNumber);
        if (saved && externalId && saved !== externalId) {
          r.error("question", `Same question as existing ${saved}. This is a duplicate.`);
          exactDuplicate = true;
        }
      }
    } else if (explicitId === undefined) {
      r.error("external_id", "Required when the question is empty.");
    }
    if (externalId) {
      const firstRow = seenIds.get(externalId);
      if (firstRow) r.error("external_id", `Same ID as row ${firstRow}.`);
      else seenIds.set(externalId, row.rowNumber);
    }

    const links = readCompanyLinks(
      r,
      ctx.companyColumn ?? false,
      ctx.companies ?? new Map(),
      ctx.today ?? new Date(),
    );

    if (externalId && subjectSlug) {
      const existing = ctx.existing.get(externalId);
      if (existing && existing.subjectSlug !== subjectSlug) {
        r.error(
          "external_id",
          `"${externalId}" is already used by a ${existing.subjectSlug} question.`,
        );
      }
    }

    if (
      r.hasErrors ||
      !externalId ||
      !subject ||
      !topic ||
      !type ||
      !questionText ||
      !explanation ||
      !difficulty ||
      expectedTimeSec === undefined ||
      !source
    ) {
      results.push(finishRow<McqValue>(row, r.messages, undefined, null));
      continue;
    }

    // Warnings that need the whole bank.
    const normalized = normalizeQuestionText(questionText);
    const sameTextRow = seenTexts.get(normalized);
    if (sameTextRow && !exactDuplicate)
      r.warn("question", `Same question text as row ${sameTextRow}.`);
    else seenTexts.set(normalized, row.rowNumber);

    const similar = await ctx.findSimilar(questionText, externalId);
    if (similar) {
      r.warn(
        "question",
        `Very similar to existing question ${similar.externalId} (${Math.round(similar.score * 100)}% match). Possible duplicate.`,
      );
    }

    const average = ctx.topicAverages.get(topicSlug!);
    if (average && (expectedTimeSec < average / 3 || expectedTimeSec > average * 3)) {
      r.warn(
        "expected_time_sec",
        `Far from this topic's average of ${Math.round(average)} seconds.`,
      );
    }

    const value: McqValue = {
      externalId,
      subjectId: subject.id,
      topicId: topic.id,
      subtopicId: subtopic?.id ?? null,
      type,
      text: rewriteAssetLinks(questionText, urls),
      code: code ?? null,
      codeLanguage: code ? (codeLanguage ?? null) : null,
      options:
        type === "NUMERIC" ? [] : trimmedOptions.map((option) => rewriteAssetLinks(option, urls)),
      correctOptions: type === "NUMERIC" ? [] : correctOptions,
      numericAnswer: type === "NUMERIC" ? numericAnswer : null,
      tolerance: type === "NUMERIC" ? (tolerance ?? 0) : null,
      explanation: rewriteAssetLinks(explanation, urls),
      difficulty,
      expectedTimeSec,
      passageId: passage?.id ?? null,
      tags,
      source,
    };

    const existing = ctx.existing.get(externalId);
    const archived = existing?.status === "ARCHIVED";
    if (archived)
      r.warn(undefined, "This question is archived. Importing brings it back as a draft.");
    const contentSame =
      !!existing && !archived && sameValues(pickContent(existing), pickContent(value));
    const linksDiffer = linksChanged(links, ctx.links?.get(externalId) ?? []);
    warnUnlinked(r, links, ctx.links?.get(externalId) ?? [], ctx.companies ?? new Map());
    value.links = links;
    value.contentChanged = !contentSame;
    const action = !existing ? "CREATE" : contentSame && !linksDiffer ? "UNCHANGED" : "UPDATE";
    results.push(finishRow(row, r.messages, value, action, existing?.id));
  }

  return results;
}

async function loadMcqContext(
  db: DbReader,
  rows: ParsedRow[],
  headers: readonly string[],
): Promise<McqContext> {
  const externalIds = rows.map((row) => row.cells.external_id?.trim()).filter(Boolean) as string[];
  const passageIds = rows.map((row) => row.cells.passage_id?.trim()).filter(Boolean) as string[];
  const subjectSlugs = [
    ...new Set(rows.map((row) => row.cells.subject?.trim()).filter(Boolean)),
  ] as string[];

  const [subjects, topics, subtopics, passages, existing, averages, companies] = await Promise.all([
    db.subject.findMany({ select: { id: true, slug: true } }),
    db.topic.findMany({ select: { id: true, slug: true, subject: { select: { slug: true } } } }),
    db.subtopic.findMany({ select: { id: true, slug: true, topic: { select: { slug: true } } } }),
    db.passage.findMany({
      where: { externalId: { in: passageIds } },
      select: { id: true, externalId: true },
    }),
    // The file's IDs, plus every question of its subject: rows without an ID are matched by
    // content, and exact duplicates are found.
    db.question.findMany({
      where: {
        OR: [{ externalId: { in: externalIds } }, { subject: { slug: { in: subjectSlugs } } }],
      },
      include: {
        subject: { select: { slug: true } },
        passage: { select: { externalId: true } },
        companies: { select: { companyId: true, askedIn: true } },
      },
    }),
    db.question.groupBy({
      by: ["topicId"],
      _avg: { expectedTimeSec: true },
      _count: { _all: true },
    }),
    loadCompanySlugs(db),
  ]);

  const topicSlugById = new Map(topics.map((t) => [t.id, t.slug]));
  return {
    byContent: new Map(
      existing
        .filter((q) => q.status !== "ARCHIVED" && subjectSlugs.includes(q.subject.slug))
        .map((q) => [
          mcqContentKey({
            text: q.text,
            options: q.options,
            code: q.code,
            passage: q.passage?.externalId ?? null,
          }),
          q.externalId,
        ]),
    ),
    companyColumn: hasCompanyColumn(headers),
    companies,
    links: new Map(existing.map((q) => [q.externalId, q.companies])),
    today: todayUtc(),
    subjects: new Map(subjects.map((s) => [s.slug, { id: s.id }])),
    topics: new Map(topics.map((t) => [t.slug, { id: t.id, subjectSlug: t.subject.slug }])),
    subtopics: new Map(subtopics.map((s) => [`${s.topic.slug}/${s.slug}`, { id: s.id }])),
    passages: new Map(passages.map((p) => [p.externalId, { id: p.id }])),
    existing: new Map(
      existing.map(({ passage: _p, companies: _c, ...q }) => [
        q.externalId,
        { ...q, subjectSlug: q.subject.slug },
      ]),
    ),
    topicAverages: new Map(
      averages
        .filter((a) => a._count._all >= MIN_QUESTIONS_FOR_AVERAGE && a._avg.expectedTimeSec)
        .map((a) => [topicSlugById.get(a.topicId)!, a._avg.expectedTimeSec!]),
    ),
    async findSimilar(text, externalId) {
      const matches = await db.$queryRaw<{ external_id: string; score: number }[]>`
        SELECT "external_id", similarity("text", ${text})::float AS score
        FROM "questions"
        WHERE "text" % ${text} AND "external_id" <> ${externalId}
        ORDER BY score DESC
        LIMIT 1`;
      const best = matches[0];
      return best && best.score >= SIMILARITY_THRESHOLD
        ? { externalId: best.external_id, score: best.score }
        : null;
    },
  };
}

function versionData(
  questionId: string,
  version: number,
  record: QuestionRecord,
  actorId: string | null,
): Prisma.ContentVersionCreateManyInput {
  return {
    entityType: "question",
    entityId: questionId,
    version,
    snapshot: toSnapshot(record),
    reason: "imported",
    createdById: actorId,
  };
}

export const mcqImport: ImportDefinition<McqValue> = {
  type: "MCQ",
  label: "MCQs (one subject per file)",
  description: "Questions for one subject. Use a ZIP with an assets/ folder for images.",
  permission: "content.edit",
  template: "mcq/quantitative-aptitude.csv",
  allowZip: true,
  columns: MCQ_COLUMNS,

  async validate(rows, file: ParsedFile, db) {
    return validateMcqRows(rows, await loadMcqContext(db, rows, file.headers), file.assets);
  },

  async prepareFiles(rows, file) {
    const names = rows.flatMap((row) =>
      [
        row.cells.question,
        row.cells.explanation,
        ...OPTION_LETTERS.map((l) => row.cells[`option_${l.toLowerCase()}`]),
      ]
        .filter(Boolean)
        .flatMap((markdown) => findAssetReferences(markdown!)),
    );
    await storeAssets(names, file.assets, hashAssets(file.assets));
  },

  async commit(rows, { tx, actorId, batchId }) {
    const outcomes = [];
    for (const row of rows) {
      const { externalId, links = null, contentChanged = true, ...content } = row.value!;
      if (row.action === "CREATE") {
        const created = await tx.question.create({
          data: {
            externalId,
            ...content,
            status: "DRAFT",
            version: 1,
            authorId: actorId,
            importBatchId: batchId,
          },
        });
        await tx.contentVersion.create({ data: versionData(created.id, 1, created, actorId) });
        await writeCompanyLinks(tx, { questionId: created.id }, links);
        outcomes.push({
          rowNumber: row.rowNumber,
          entityId: created.id,
          action: "CREATE" as const,
        });
        continue;
      }

      const before = await tx.question.findUniqueOrThrow({ where: { externalId } });
      if (!contentChanged) {
        // Only the company tags changed: the question keeps its status and version.
        await writeCompanyLinks(tx, { questionId: before.id }, links);
        outcomes.push({ rowNumber: row.rowNumber, entityId: before.id, action: "UPDATE" as const });
        continue;
      }
      // Imports never publish: a changed item goes back to draft for review (D-010).
      const updated = await tx.question.update({
        where: { id: before.id },
        data: {
          ...content,
          status: "DRAFT",
          version: before.version + 1,
          importBatchId: batchId,
          reviewNote: null,
          reviewerId: null,
          submittedAt: null,
          publishedAt: null,
        },
      });
      await tx.contentVersion.create({
        data: versionData(updated.id, updated.version, updated, actorId),
      });
      await writeCompanyLinks(tx, { questionId: updated.id }, links);
      outcomes.push({
        rowNumber: row.rowNumber,
        entityId: updated.id,
        action: "UPDATE" as const,
        previous: toSnapshot(before),
      });
    }
    return outcomes;
  },

  rollback: {
    async check(allRows, batchId, db) {
      // Rows that only changed company tags have no snapshot and nothing to undo.
      const rows = allRows.filter((row) => row.action === "CREATE" || row.previous);
      const questions = await db.question.findMany({
        where: { id: { in: rows.map((row) => row.entityId) } },
        select: {
          id: true,
          externalId: true,
          status: true,
          version: true,
          importBatchId: true,
          _count: { select: { companies: true } },
        },
      });
      const byId = new Map(questions.map((q) => [q.id, q]));
      for (const row of rows) {
        const q = byId.get(row.entityId);
        if (!q) return "A question from this import no longer exists.";
        const expectedVersion =
          row.action === "CREATE" ? 1 : fromSnapshot(row.previous).version + 1;
        if (q.importBatchId !== batchId || q.version !== expectedVersion || q.status !== "DRAFT") {
          return `${q.externalId} has changed since this import, so the batch can't be undone.`;
        }
      }
      return null;
    },
    async apply(rows, tx) {
      for (const row of rows) {
        if (row.action !== "CREATE" && !row.previous) continue;
        if (row.action === "CREATE") {
          await tx.contentVersion.deleteMany({
            where: { entityType: "question", entityId: row.entityId },
          });
          await tx.question.delete({ where: { id: row.entityId } });
        } else {
          const previous = fromSnapshot(row.previous);
          await tx.question.update({ where: { id: row.entityId }, data: previous });
          await tx.contentVersion.deleteMany({
            where: {
              entityType: "question",
              entityId: row.entityId,
              version: { gt: previous.version },
            },
          });
        }
      }
    },
  },
};

mcqImport.replace = {
  scope: (file) => `every question in ${file.rows[0]?.cells.subject?.trim() || "this subject"}`,
  async missing(file, db) {
    const subject = file.rows[0]?.cells.subject?.trim() ?? "";
    const questions = await db.question.findMany({
      where: { subject: { slug: subject }, status: { not: "ARCHIVED" } },
      select: { id: true, externalId: true, text: true },
      orderBy: { externalId: "asc" },
    });
    const ctx = await loadMcqContext(db, file.rows, file.headers);
    const results = await validateMcqRows(
      file.rows,
      { ...ctx, findSimilar: async () => null },
      file.assets,
    );
    // Every ID the file names, including rows with errors (they're fixed and re-uploaded, not lost).
    const inFile = new Set<string>(
      file.rows.map((row) => row.cells.external_id?.trim()).filter(Boolean) as string[],
    );
    for (const row of results) if (row.value) inFile.add(row.value.externalId);
    return questions
      .filter((q) => !inFile.has(q.externalId))
      .map((q) => ({ id: q.id, label: `${q.externalId} · ${q.text.slice(0, 60)}` }));
  },
  async archive(ids, tx) {
    await tx.question.updateMany({ where: { id: { in: ids } }, data: { status: "ARCHIVED" } });
  },
  async backup(file, db) {
    const subject = file.rows[0]?.cells.subject?.trim() ?? "";
    return { fileName: `${subject || "questions"}-backup.csv`, csv: await exportMcq(db, subject) };
  },
};

const SOURCE_CELLS = { ORIGINAL: "original", MEMORY_BASED: "memory-based" } as const;

/** Every question of a subject that isn't archived, in the MCQ file format (IDs filled in). */
export async function exportMcq(db: DbReader, subjectSlug: string): Promise<string> {
  const questions = await db.question.findMany({
    where: { subject: { slug: subjectSlug }, status: { not: "ARCHIVED" } },
    orderBy: { externalId: "asc" },
    include: {
      subject: { select: { slug: true } },
      topic: { select: { slug: true } },
      subtopic: { select: { slug: true } },
      passage: { select: { externalId: true } },
      companies: { include: { company: { select: { slug: true } } } },
    },
  });
  const rows = questions.map((q) => {
    const row: Record<string, string> = {
      external_id: q.externalId,
      subject: q.subject.slug,
      topic: q.topic.slug,
      subtopic: q.subtopic?.slug ?? "",
      type: q.type.toLowerCase(),
      question: q.text,
      code: q.code ?? "",
      code_language: q.codeLanguage ?? "",
      correct: q.type === "NUMERIC" ? String(q.numericAnswer ?? "") : q.correctOptions.join("|"),
      tolerance: q.type === "NUMERIC" && q.tolerance ? String(q.tolerance) : "",
      explanation: q.explanation,
      difficulty: q.difficulty.toLowerCase(),
      expected_time_sec: String(q.expectedTimeSec),
      passage_id: q.passage?.externalId ?? "",
      tags: q.tags.join("|"),
      source: SOURCE_CELLS[q.source],
      companies: q.companies.map((c) => c.company.slug).join("|"),
      asked_in: q.companies.every((c) => c.askedIn.join() === q.companies[0]!.askedIn.join())
        ? (q.companies[0]?.askedIn ?? []).join("|")
        : "",
    };
    q.options.forEach((option, i) => {
      row[`option_${OPTION_LETTERS[i]!.toLowerCase()}`] = option;
    });
    return row;
  });
  return toCsv(
    MCQ_COLUMNS.map((c) => c.name),
    rows,
  );
}
