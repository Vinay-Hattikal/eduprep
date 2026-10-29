// Rules every question must pass. Shared by the CSV importer, the question editor and the
// "submit for review" check, so all three agree (PRD 9.4 automatic checks).

import type { QuestionType } from "@/generated/prisma/enums";

export const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;
export type OptionLetter = (typeof OPTION_LETTERS)[number];

/** Options up to the last filled one (blank trailing slots dropped). */
export function filledOptions(options: readonly string[]): string[] {
  return options.slice(0, options.findLastIndex((o) => o.trim()) + 1);
}

/** A question's code snippet as a fenced Markdown block ("pseudocode" gets no highlighting). */
export function codeFence(code: string, language: string | null): string {
  return "```" + (language === "pseudocode" ? "" : (language ?? "")) + "\n" + code + "\n```";
}

export const CODE_LANGUAGES = [
  "c",
  "cpp",
  "java",
  "python",
  "javascript",
  "sql",
  "pseudocode",
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export const MIN_EXPECTED_SECONDS = 10;
export const MAX_EXPECTED_SECONDS = 600;
export const SHORT_EXPLANATION_CHARS = 20;

/** Question content as authored, independent of where it came from. */
export type QuestionContent = {
  type: QuestionType;
  text: string;
  code: string | null;
  codeLanguage: string | null;
  options: string[];
  correctOptions: string[];
  numericAnswer: number | null;
  tolerance: number | null;
  explanation: string;
  expectedTimeSec: number;
};

export type Issue = { level: "error" | "warning"; field: string; message: string };

function normalizeOption(option: string): string {
  return option.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Returns every problem with the question. Errors block saving for review; warnings don't. */
export function checkQuestion(q: QuestionContent): Issue[] {
  const issues: Issue[] = [];
  const error = (field: string, message: string) => issues.push({ level: "error", field, message });
  const warn = (field: string, message: string) =>
    issues.push({ level: "warning", field, message });

  if (!q.text.trim()) error("text", "Question text is required.");
  if (!q.explanation.trim()) error("explanation", "Explanation is required.");
  else if (q.explanation.trim().length < SHORT_EXPLANATION_CHARS)
    warn("explanation", "Explanation is very short. Explain the method, not just the answer.");

  if (q.code && !q.codeLanguage) error("codeLanguage", "Choose the language of the code snippet.");
  if (q.codeLanguage && !CODE_LANGUAGES.includes(q.codeLanguage as CodeLanguage))
    error("codeLanguage", `Unknown code language "${q.codeLanguage}".`);

  if (
    !Number.isInteger(q.expectedTimeSec) ||
    q.expectedTimeSec < MIN_EXPECTED_SECONDS ||
    q.expectedTimeSec > MAX_EXPECTED_SECONDS
  ) {
    error(
      "expectedTimeSec",
      `Expected time must be a whole number between ${MIN_EXPECTED_SECONDS} and ${MAX_EXPECTED_SECONDS} seconds.`,
    );
  }

  if (q.type === "NUMERIC") {
    if (q.options.some((option) => option.trim()))
      error("options", "Numeric questions have no options; leave them empty.");
    if (q.numericAnswer === null || !Number.isFinite(q.numericAnswer))
      error("numericAnswer", "Numeric questions need a numeric answer.");
    if (q.tolerance !== null && (!Number.isFinite(q.tolerance) || q.tolerance < 0))
      error("tolerance", "Tolerance must be zero or a positive number.");
    return issues;
  }

  // Single and multiple choice
  const options = q.options.map((option) => option.trim());
  const lastFilled = options.findLastIndex((option) => option.length > 0);
  const filled = options.slice(0, lastFilled + 1);
  if (filled.some((option) => option.length === 0))
    error("options", "Fill options in order (A, B, C...) without gaps.");
  if (filled.length < 2) error("options", "Add at least 2 options.");
  if (options.length > OPTION_LETTERS.length)
    error("options", "A question can have at most 5 options.");

  const seen = new Set<string>();
  for (const option of filled.filter(Boolean)) {
    const key = normalizeOption(option);
    if (seen.has(key)) {
      error("options", `Two options are the same: "${option}".`);
      break;
    }
    seen.add(key);
  }

  if (q.tolerance !== null)
    warn("tolerance", "Tolerance only applies to numeric questions and is ignored.");

  const correct = q.correctOptions;
  if (correct.length === 0) error("correctOptions", "Mark the correct answer.");
  if (q.type === "SINGLE" && correct.length > 1)
    error("correctOptions", "A single-answer question must have exactly one correct option.");
  if (new Set(correct).size !== correct.length)
    error("correctOptions", "A correct option is listed twice.");
  for (const letter of correct) {
    const index = OPTION_LETTERS.indexOf(letter as OptionLetter);
    if (index === -1 || !options[index]) {
      error("correctOptions", `Correct answer ${letter} points to an empty option.`);
      break;
    }
  }
  if (q.type === "MULTIPLE" && filled.length > 0 && correct.length === filled.length)
    warn("correctOptions", "Every option is marked correct. Is that intended?");

  return issues;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((issue) => issue.level === "error");
}

/** Normalised text for spotting duplicates inside one file. */
export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
