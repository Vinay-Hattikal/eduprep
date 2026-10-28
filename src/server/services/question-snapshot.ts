// What a question looks like at one point in time. Stored in ContentVersion (history) and in
// ImportRow.previous (import rollback). Pure, so it is unit-tested.

import type { Prisma } from "@/generated/prisma/client";
import type {
  ContentSource,
  ContentStatus,
  Difficulty,
  QuestionType,
} from "@/generated/prisma/enums";

export type QuestionRecord = {
  subjectId: string;
  topicId: string;
  subtopicId: string | null;
  type: QuestionType;
  text: string;
  code: string | null;
  codeLanguage: string | null;
  options: string[];
  correctOptions: string[];
  numericAnswer: number | null;
  tolerance: number | null;
  explanation: string;
  difficulty: Difficulty;
  expectedTimeSec: number;
  passageId: string | null;
  tags: string[];
  source: ContentSource;
  status: ContentStatus;
  version: number;
  reviewNote: string | null;
  reviewerId: string | null;
  submittedAt: Date | null;
  publishedAt: Date | null;
  importBatchId: string | null;
};

/** The authored content only (what an import or an edit can change). */
export const CONTENT_FIELDS = [
  "subjectId",
  "topicId",
  "subtopicId",
  "type",
  "text",
  "code",
  "codeLanguage",
  "options",
  "correctOptions",
  "numericAnswer",
  "tolerance",
  "explanation",
  "difficulty",
  "expectedTimeSec",
  "passageId",
  "tags",
  "source",
] as const satisfies readonly (keyof QuestionRecord)[];

export type QuestionContentFields = Pick<QuestionRecord, (typeof CONTENT_FIELDS)[number]>;

export function pickContent(record: QuestionContentFields): QuestionContentFields {
  return Object.fromEntries(
    CONTENT_FIELDS.map((field) => [field, record[field]]),
  ) as QuestionContentFields;
}

export function toSnapshot(record: QuestionRecord): Prisma.InputJsonObject {
  return {
    ...pickContent(record),
    status: record.status,
    version: record.version,
    reviewNote: record.reviewNote,
    reviewerId: record.reviewerId,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    importBatchId: record.importBatchId,
  };
}

export function fromSnapshot(snapshot: Prisma.JsonValue): QuestionRecord {
  const s = snapshot as Record<string, unknown>;
  const date = (value: unknown) => (typeof value === "string" ? new Date(value) : null);
  return {
    subjectId: s.subjectId as string,
    topicId: s.topicId as string,
    subtopicId: (s.subtopicId as string | null) ?? null,
    type: s.type as QuestionType,
    text: s.text as string,
    code: (s.code as string | null) ?? null,
    codeLanguage: (s.codeLanguage as string | null) ?? null,
    options: (s.options as string[]) ?? [],
    correctOptions: (s.correctOptions as string[]) ?? [],
    numericAnswer: (s.numericAnswer as number | null) ?? null,
    tolerance: (s.tolerance as number | null) ?? null,
    explanation: s.explanation as string,
    difficulty: s.difficulty as Difficulty,
    expectedTimeSec: s.expectedTimeSec as number,
    passageId: (s.passageId as string | null) ?? null,
    tags: (s.tags as string[]) ?? [],
    source: s.source as ContentSource,
    status: s.status as ContentStatus,
    version: s.version as number,
    reviewNote: (s.reviewNote as string | null) ?? null,
    reviewerId: (s.reviewerId as string | null) ?? null,
    submittedAt: date(s.submittedAt),
    publishedAt: date(s.publishedAt),
    importBatchId: (s.importBatchId as string | null) ?? null,
  };
}

/** Which content fields differ between two versions, for the history view. */
export function changedFields(
  before: Partial<QuestionContentFields>,
  after: Partial<QuestionContentFields>,
): string[] {
  return CONTENT_FIELDS.filter(
    (field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null),
  );
}
