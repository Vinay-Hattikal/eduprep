// Automatic flags from how students answer a question (PRD 9.6). Pure and unit-tested.
// Flags are hints for a reviewer, never automatic changes.

export const MIN_ATTEMPTS_FOR_FLAGS = 20;

export type QuestionStats = {
  attempts: number;
  correct: number;
  medianTimeSec: number;
  expectedTimeSec: number;
  correctOptions: string[];
  /** How often each option letter was chosen. */
  optionCounts: Record<string, number>;
};

export type QuestionFlag = "wrong-key" | "too-hard" | "too-easy" | "slow" | "distractor";

export const FLAG_LABELS: Record<QuestionFlag, string> = {
  "wrong-key": "Check the answer key",
  "too-hard": "Very few get it right",
  "too-easy": "Almost everyone gets it right",
  slow: "Takes much longer than expected",
  distractor: "One wrong option is very popular",
};

export function flagQuestion(stats: QuestionStats): QuestionFlag[] {
  if (stats.attempts < MIN_ATTEMPTS_FOR_FLAGS) return [];
  const flags: QuestionFlag[] = [];
  const accuracy = stats.correct / stats.attempts;
  // The wrong option students pick most.
  const [wrong] = Object.entries(stats.optionCounts)
    .filter(([letter]) => !stats.correctOptions.includes(letter))
    .sort((a, b) => b[1] - a[1]);

  // A wrong option chosen far more than the right one usually means a wrong key.
  const rightCount = Math.max(0, ...stats.correctOptions.map((o) => stats.optionCounts[o] ?? 0));
  if (wrong && wrong[1] >= 2 * Math.max(1, rightCount)) flags.push("wrong-key");
  else if (wrong && wrong[1] / stats.attempts >= 0.4) flags.push("distractor");

  if (accuracy < 0.15 && !flags.includes("wrong-key")) flags.push("too-hard");
  if (accuracy > 0.97) flags.push("too-easy");
  if (stats.medianTimeSec > stats.expectedTimeSec * 2.5) flags.push("slow");
  return flags;
}
