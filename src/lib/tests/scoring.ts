// Scores a finished mock test (PRD 4.6). Pure and unit-tested.
// MCQ: +marks when correct, -negative when wrong, 0 when skipped.
// Coding: marks × the best submission's score (0-1; partial for per-test problems).

import { gradeAnswer, type AnswerKey } from "@/lib/learning/grading";

export type SectionRules = { name: string; marksPerItem: number; negativeMarks: number };

export type ScoredInput =
  | {
      kind: "mcq";
      section: number;
      key: AnswerKey;
      selectedOptions: string[];
      numericAnswer: number | null;
    }
  | { kind: "coding"; section: number; bestScore: number | null };

export type ItemScore = { answered: boolean; isCorrect: boolean | null; marks: number };

export function scoreItem(item: ScoredInput, rules: SectionRules): ItemScore {
  if (item.kind === "coding") {
    if (item.bestScore === null) return { answered: false, isCorrect: null, marks: 0 };
    return {
      answered: true,
      isCorrect: item.bestScore >= 1,
      marks: round(rules.marksPerItem * Math.min(1, Math.max(0, item.bestScore))),
    };
  }
  const answered =
    item.key.type === "NUMERIC" ? item.numericAnswer !== null : item.selectedOptions.length > 0;
  if (!answered) return { answered, isCorrect: null, marks: 0 };
  const correct = gradeAnswer(item.key, {
    selectedOptions: item.selectedOptions,
    numericAnswer: item.numericAnswer,
  });
  return {
    answered,
    isCorrect: correct,
    marks: correct ? rules.marksPerItem : -rules.negativeMarks,
  };
}

export type SectionScore = {
  name: string;
  score: number;
  maxScore: number;
  attempted: number;
  correct: number;
  total: number;
};

export function scoreSections(
  sections: readonly SectionRules[],
  items: readonly (ScoredInput & { score: ItemScore })[],
): { sections: SectionScore[]; score: number; maxScore: number } {
  const result = sections.map((rules, index) => {
    const mine = items.filter((item) => item.section === index);
    return {
      name: rules.name,
      score: round(mine.reduce((sum, item) => sum + item.score.marks, 0)),
      maxScore: round(mine.length * rules.marksPerItem),
      attempted: mine.filter((item) => item.score.answered).length,
      correct: mine.filter((item) => item.score.isCorrect).length,
      total: mine.length,
    };
  });
  return {
    sections: result,
    score: round(result.reduce((sum, s) => sum + s.score, 0)),
    maxScore: round(result.reduce((sum, s) => sum + s.maxScore, 0)),
  };
}

/** Share of other sittings that scored lower (ties count half), 0-100. */
export function percentile(score: number, others: readonly number[]): number | null {
  if (others.length < 5) return null; // too few to mean anything
  const below = others.filter((s) => s < score).length;
  const equal = others.filter((s) => s === score).length;
  return Math.round(((below + equal / 2) / others.length) * 100);
}

const round = (n: number) => Math.round(n * 100) / 100;
