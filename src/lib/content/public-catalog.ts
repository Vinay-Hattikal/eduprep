// Public coding problem and mock test pages (D-058, C.4). Pure, so what may leave the server is
// unit-tested: problems show their statement and sample tests only (never hidden tests,
// solutions, hints or editorials), and mock tests show their format, never their questions.

import type { PlatformStyle, TestKind } from "@/generated/prisma/enums";

export const PLATFORM_LABELS: Record<PlatformStyle, string> = {
  GENERIC: "Standard",
  TCS_ION: "TCS iON style",
  HACKERRANK: "HackerRank style",
  AMCAT: "AMCAT style",
};

export const TEST_KIND_LABELS: Record<TestKind, string> = {
  TOPIC: "Topic test",
  COMPANY_MOCK: "Company mock",
  OA: "Online assessment",
};

type StoredTest = { isSample: boolean; input: string; output: string; explanation: string | null };

export type PublicProblem = {
  slug: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  languages: string[];
  samples: { input: string; output: string; explanation: string | null }[];
};

/** Copies only what the public may see: sample tests, never hidden ones. */
export function toPublicProblem(problem: {
  slug: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  languages: string[];
  testCases: StoredTest[];
}): PublicProblem {
  return {
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    statement: problem.statement,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    languages: problem.languages,
    samples: problem.testCases
      .filter((t) => t.isSample)
      .map(({ input, output, explanation }) => ({ input, output, explanation })),
  };
}

export type MockSection = {
  name: string;
  type: "MCQ" | "CODING";
  minutes: number;
  questions: number;
  marksPerItem: number;
  negativeMarks: number;
  canGoBack: boolean;
};

/** A mock test's format in numbers: sections, questions, minutes, marks. */
export function mockSummary(sections: readonly MockSection[]) {
  return {
    sections: sections.length,
    questions: sections.reduce((n, s) => n + s.questions, 0),
    minutes: sections.reduce((n, s) => n + s.minutes, 0),
    marks: sections.reduce((n, s) => n + s.questions * s.marksPerItem, 0),
    negativeMarking: sections.some((s) => s.negativeMarks > 0),
    coding: sections.some((s) => s.type === "CODING"),
  };
}
