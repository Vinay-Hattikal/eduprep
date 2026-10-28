// Grades one answer. Multiple-answer questions need the exact set (no partial credit), as in
// company tests that mark "select all that apply" right or wrong.

import type { QuestionType } from "@/generated/prisma/enums";

export type AnswerKey = {
  type: QuestionType;
  correctOptions: string[];
  numericAnswer: number | null;
  tolerance: number | null;
};

export type Answer = { selectedOptions: string[]; numericAnswer: number | null };

export function gradeAnswer(key: AnswerKey, answer: Answer): boolean {
  if (key.type === "NUMERIC") {
    if (answer.numericAnswer === null || key.numericAnswer === null) return false;
    if (!Number.isFinite(answer.numericAnswer)) return false;
    // A tiny epsilon absorbs floating-point noise like 0.1 + 0.2.
    return Math.abs(answer.numericAnswer - key.numericAnswer) <= (key.tolerance ?? 0) + 1e-9;
  }
  const selected = new Set(answer.selectedOptions);
  if (key.type === "SINGLE" && selected.size !== 1) return false;
  return (
    selected.size === key.correctOptions.length && key.correctOptions.every((o) => selected.has(o))
  );
}
