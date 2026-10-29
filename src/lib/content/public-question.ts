// What a question looks like on public pages (D-058). Pure, so the "answers only for samples"
// rule is unit-tested: every public page builds its data through toPublicQuestion, and the
// answer fields of non-sample questions never reach the page.

import type { QuestionType } from "@/generated/prisma/enums";

/** Topics with fewer published questions than this stay out of search results. */
export const MIN_INDEXABLE_TOPIC = 5;
export const PUBLIC_PAGE_SIZE = 20;

export type PublicAnswer = {
  correctOptions: string[];
  numericAnswer: number | null;
  tolerance: number | null;
  explanation: string;
};

export type PublicQuestion = {
  externalId: string;
  /** Lower-case ID used in the URL: /question/qa-pct-0042 */
  urlId: string;
  type: QuestionType;
  text: string;
  code: string | null;
  codeLanguage: string | null;
  options: string[];
  difficulty: "EASY" | "MEDIUM" | "HARD";
  /** Null unless the question is a public sample. */
  answer: PublicAnswer | null;
};

type StoredQuestion = {
  externalId: string;
  type: QuestionType;
  text: string;
  code: string | null;
  codeLanguage: string | null;
  options: string[];
  difficulty: "EASY" | "MEDIUM" | "HARD";
  publicSample: boolean;
  correctOptions: string[];
  numericAnswer: number | null;
  tolerance: number | null;
  explanation: string;
};

export function questionUrl(externalId: string): string {
  return `/question/${externalId.toLowerCase()}`;
}

/** Copies only what the public may see. Answers are dropped unless it's a public sample. */
export function toPublicQuestion(q: StoredQuestion): PublicQuestion {
  return {
    externalId: q.externalId,
    urlId: q.externalId.toLowerCase(),
    type: q.type,
    text: q.text,
    code: q.code,
    codeLanguage: q.codeLanguage,
    options: q.options.slice(0, q.options.findLastIndex((o) => o.trim()) + 1),
    difficulty: q.difficulty,
    answer: q.publicSample
      ? {
          correctOptions: q.correctOptions,
          numericAnswer: q.numericAnswer,
          tolerance: q.tolerance,
          explanation: q.explanation,
        }
      : null,
  };
}

/** A short, readable title from the question text (Markdown and LaTeX stripped). */
export function questionTitle(text: string, max = 70): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$?([^$]*)\$\$?/g, "$1")
    .replace(/[*_`#>|[\]()!\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : max).trim()}…`;
}
