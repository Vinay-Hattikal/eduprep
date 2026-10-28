// Runs one program against a list of tests and decides the verdict. Judge-agnostic, so unit
// tests can pass a fake judge; the real one comes from getJudge().

import type { ScoringMode, Verdict } from "@/generated/prisma/enums";
import { outputsMatch } from "@/lib/coding/checker";
import type { CodingLanguage } from "@/lib/coding/languages";
import type { Judge, Limits, RunResult } from "@/server/integrations/judge/types";

/** What a result may show of a test's data, so hidden tests never leak to students. */
const SHOWN_CHARS = 2000;

export type EvalTest = {
  input: string;
  /** Null for custom input: the program just runs, nothing is compared. */
  output: string | null;
  isSample: boolean;
};

/** One test's outcome as stored in Submission.results. Data fields only for visible tests. */
export type TestResult = {
  index: number;
  sample: boolean;
  verdict: Verdict;
  timeMs: number;
  input?: string;
  expected?: string;
  output?: string;
  stderr?: string;
};

export type Evaluation = {
  verdict: Verdict;
  passed: number;
  total: number;
  /** 0-1: share of tests passed (PER_TEST), otherwise 0 or 1. */
  score: number;
  runtimeMs: number | null;
  compileOutput: string | null;
  results: TestResult[];
};

const RUN_VERDICTS: Record<Exclude<RunResult["status"], "OK">, Verdict> = {
  RUNTIME_ERROR: "RUNTIME_ERROR",
  TIME_LIMIT: "TIME_LIMIT",
  MEMORY_LIMIT: "MEMORY_LIMIT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

const clip = (text: string) =>
  text.length > SHOWN_CHARS ? `${text.slice(0, SHOWN_CHARS)}…` : text;

export async function evaluate(
  judge: Judge,
  options: {
    language: CodingLanguage;
    code: string;
    limits: Limits;
    checker: string;
    scoring: ScoringMode;
    tests: EvalTest[];
    /** Show input/output of hidden tests too (admin validation). */
    revealAll?: boolean;
  },
): Promise<Evaluation> {
  const total = options.tests.length;
  const compiled = await judge.compile(options.language, options.code, options.limits);
  if (!compiled.ok) {
    return {
      verdict: compiled.internal ? "INTERNAL_ERROR" : "COMPILATION_ERROR",
      passed: 0,
      total,
      score: 0,
      runtimeMs: null,
      compileOutput: compiled.error,
      results: [],
    };
  }

  const results: TestResult[] = [];
  let passed = 0;
  let firstFailure: Verdict | null = null;
  let runtimeMs = 0;
  try {
    for (const [index, test] of options.tests.entries()) {
      const run = await compiled.program.run(test.input);
      const verdict: Verdict =
        run.status !== "OK"
          ? RUN_VERDICTS[run.status]
          : test.output === null || outputsMatch(test.output, run.stdout, options.checker)
            ? "ACCEPTED"
            : "WRONG_ANSWER";
      runtimeMs = Math.max(runtimeMs, run.timeMs);
      const visible = test.isSample || options.revealAll;
      results.push({
        index,
        sample: test.isSample,
        verdict,
        timeMs: run.timeMs,
        ...(visible && {
          input: clip(test.input),
          ...(test.output !== null && { expected: clip(test.output) }),
          output: clip(run.stdout),
          stderr: clip(run.stderr),
        }),
      });
      if (verdict === "ACCEPTED") passed += 1;
      else {
        firstFailure ??= verdict;
        // A judge fault or an all-or-nothing failure decides the result: skip the rest.
        if (verdict === "INTERNAL_ERROR" || options.scoring === "ALL_OR_NOTHING") break;
      }
    }
  } finally {
    await compiled.program.dispose();
  }

  const verdict = firstFailure ?? "ACCEPTED";
  const score =
    options.scoring === "PER_TEST" ? (total ? passed / total : 0) : verdict === "ACCEPTED" ? 1 : 0;
  return { verdict, passed, total, score, runtimeMs, compileOutput: null, results };
}
