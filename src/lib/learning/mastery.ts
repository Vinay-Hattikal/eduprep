// Topic mastery, 0–100. Explainable on purpose:
// - Every answer adds evidence weighted by difficulty (easy 1, medium 1.5, hard 2).
// - Older evidence fades (each new answer multiplies the past by 0.9), so improvement shows.
// - A small "prior" of 2 keeps scores honest after only a few answers: 2 right answers ≠ 100%.
// score = correctWeight / (totalWeight + PRIOR)

import type { Difficulty } from "@/generated/prisma/enums";

export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { EASY: 1, MEDIUM: 1.5, HARD: 2 };
export const DECAY = 0.9;
export const PRIOR = 2;

export type MasteryState = {
  weightSum: number;
  correctSum: number;
  attempts: number;
  correct: number;
};

export const EMPTY_MASTERY: MasteryState = { weightSum: 0, correctSum: 0, attempts: 0, correct: 0 };

export function applyAnswer(
  state: MasteryState,
  answer: { correct: boolean; difficulty: Difficulty },
): MasteryState & { score: number } {
  const weight = DIFFICULTY_WEIGHT[answer.difficulty];
  const weightSum = state.weightSum * DECAY + weight;
  const correctSum = state.correctSum * DECAY + (answer.correct ? weight : 0);
  return {
    weightSum,
    correctSum,
    attempts: state.attempts + 1,
    correct: state.correct + (answer.correct ? 1 : 0),
    score: masteryScore(weightSum, correctSum),
  };
}

export function masteryScore(weightSum: number, correctSum: number): number {
  if (weightSum <= 0) return 0;
  return Math.round((100 * correctSum) / (weightSum + PRIOR));
}

export type MasteryLevel = "new" | "weak" | "fair" | "strong";

export function masteryLevel(score: number, attempts: number): MasteryLevel {
  if (attempts === 0) return "new";
  if (score >= 70) return "strong";
  if (score >= 40) return "fair";
  return "weak";
}

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new: "Not started",
  weak: "Needs work",
  fair: "Getting there",
  strong: "Strong",
};
