import { describe, expect, it } from "vitest";
import { isValidChecker, outputsMatch } from "@/lib/coding/checker";
import { effectiveTimeLimit } from "@/lib/coding/languages";
import { evaluate } from "@/server/coding/evaluate";
import {
  MIN_HIDDEN_TESTS,
  readProblemRow,
  validateSolutionRows,
  validateTestCaseRows,
} from "@/server/imports/definitions/coding";
import type { ParsedRow } from "@/server/imports/parse";
import { mapJudge0Status } from "@/server/integrations/judge/judge0";
import type { Judge, RunResult } from "@/server/integrations/judge/types";

const asRows = (...cells: Record<string, string>[]): ParsedRow[] =>
  cells.map((c, i) => ({ rowNumber: i + 2, cells: c }));
const errorColumns = (row: { messages: { level: string; column?: string }[] }) =>
  row.messages.filter((m) => m.level === "error").map((m) => m.column);

describe("output checker", () => {
  it("compares lines exactly, ignoring trailing spaces and blank lines", () => {
    expect(outputsMatch("YES\n", "YES", "exact")).toBe(true);
    expect(outputsMatch("1 2\n3", "1 2  \r\n3\n\n", "exact")).toBe(true);
    expect(outputsMatch("1 2", "1  2", "exact")).toBe(false);
    expect(outputsMatch("yes", "YES", "exact")).toBe(false);
  });

  it("compares tokens with ignore_whitespace", () => {
    expect(outputsMatch("1 2\n3", "1\n2 3", "ignore_whitespace")).toBe(true);
    expect(outputsMatch("1 2 3", "1 2", "ignore_whitespace")).toBe(false);
  });

  it("compares numbers within a tolerance", () => {
    expect(outputsMatch("3.14159", "3.141592", "float:1e-5")).toBe(true);
    expect(outputsMatch("3.14159", "3.15", "float:1e-5")).toBe(false);
    expect(outputsMatch("1000000", "1000000.5", "float:1e-6")).toBe(true); // relative
    expect(outputsMatch("YES 1.0", "YES 1", "float:1e-6")).toBe(true);
    expect(outputsMatch("YES", "NO", "float:1e-6")).toBe(false);
  });

  it("validates checker specs", () => {
    expect(["exact", "ignore_whitespace", "float:1e-6"].every(isValidChecker)).toBe(true);
    expect(["float:0", "float:abc", "float:2", "fuzzy"].some(isValidChecker)).toBe(false);
  });
});

describe("judge limits and status", () => {
  it("gives slower languages more time", () => {
    expect(effectiveTimeLimit("cpp", 1000)).toBe(1150);
    expect(effectiveTimeLimit("python", 1000)).toBe(3400);
    expect(effectiveTimeLimit("java", 1000)).toBe(3200);
  });

  it("maps Judge0 statuses", () => {
    expect(mapJudge0Status(3)).toBe("OK");
    expect(mapJudge0Status(5)).toBe("TIME_LIMIT");
    expect(mapJudge0Status(11)).toBe("RUNTIME_ERROR");
    expect(mapJudge0Status(13)).toBe("INTERNAL_ERROR");
    expect(mapJudge0Status(99)).toBe("INTERNAL_ERROR");
  });
});

/** A judge whose program answers from a table: input → result. */
function fakeJudge(
  answers: Record<string, Partial<RunResult>>,
  compileError?: string,
): Judge & { disposed: number } {
  const judge = {
    name: "fake",
    disposed: 0,
    async compile() {
      if (compileError) return { ok: false as const, error: compileError };
      return {
        ok: true as const,
        program: {
          run: async (input: string): Promise<RunResult> => ({
            status: "OK",
            stdout: "",
            stderr: "",
            timeMs: 10,
            ...answers[input],
          }),
          dispose: async () => {
            judge.disposed += 1;
          },
        },
      };
    },
  };
  return judge;
}

describe("evaluate", () => {
  const tests = [
    { input: "s", output: "1", isSample: true },
    { input: "h1", output: "2", isSample: false },
    { input: "h2", output: "3", isSample: false },
  ];
  const options = {
    language: "cpp" as const,
    code: "x",
    limits: { timeLimitMs: 1000, memoryLimitMb: 256 },
    checker: "exact",
    tests,
  };

  it("accepts when every test passes and keeps hidden data private", async () => {
    const judge = fakeJudge({
      s: { stdout: "1" },
      h1: { stdout: "2", timeMs: 40 },
      h2: { stdout: "3" },
    });
    const result = await evaluate(judge, { ...options, scoring: "ALL_OR_NOTHING" });
    expect(result).toMatchObject({
      verdict: "ACCEPTED",
      passed: 3,
      total: 3,
      score: 1,
      runtimeMs: 40,
    });
    expect(result.results[0]).toMatchObject({ input: "s", expected: "1", output: "1" });
    expect(Object.keys(result.results[1]!).sort()).toEqual([
      "index",
      "sample",
      "timeMs",
      "verdict",
    ]);
    expect(judge.disposed).toBe(1);
  });

  it("stops at the first failure for all-or-nothing problems", async () => {
    const judge = fakeJudge({
      s: { stdout: "1" },
      h1: { status: "TIME_LIMIT" },
      h2: { stdout: "3" },
    });
    const result = await evaluate(judge, { ...options, scoring: "ALL_OR_NOTHING" });
    expect(result).toMatchObject({ verdict: "TIME_LIMIT", passed: 1, score: 0 });
    expect(result.results).toHaveLength(2);
  });

  it("gives partial marks for per-test problems", async () => {
    const judge = fakeJudge({ s: { stdout: "1" }, h1: { stdout: "wrong" }, h2: { stdout: "3" } });
    const result = await evaluate(judge, { ...options, scoring: "PER_TEST" });
    expect(result.verdict).toBe("WRONG_ANSWER");
    expect(result.passed).toBe(2);
    expect(result.score).toBeCloseTo(2 / 3);
    expect(result.results).toHaveLength(3);
  });

  it("reports compile errors without running", async () => {
    const result = await evaluate(fakeJudge({}, "main.cpp:1: error"), {
      ...options,
      scoring: "PER_TEST",
    });
    expect(result).toMatchObject({
      verdict: "COMPILATION_ERROR",
      compileOutput: "main.cpp:1: error",
      results: [],
    });
  });

  it("runs custom input without comparing", async () => {
    const judge = fakeJudge({ mine: { stdout: "anything" } });
    const result = await evaluate(judge, {
      ...options,
      scoring: "PER_TEST",
      tests: [{ input: "mine", output: null, isSample: true }],
    });
    expect(result.verdict).toBe("ACCEPTED");
    expect(result.results[0]).not.toHaveProperty("expected");
  });
});

describe("coding imports", () => {
  const problemCtx = {
    topics: new Map([
      ["arrays", { id: "t-arrays" }],
      ["hashing", { id: "t-hash" }],
    ]),
    existing: new Map(),
    slugs: new Map([["taken", "CODE-OTHER"]]),
  };
  const problemRow = (o: Record<string, string> = {}) => ({
    external_id: "CODE-1",
    title: "Pair sum",
    slug: "pair-sum",
    difficulty: "easy",
    topics: "arrays|hashing",
    statement: "Find a pair.",
    input_format: "n t",
    output_format: "YES or NO",
    constraints: "n ≤ 10^5",
    time_limit_ms: "2000",
    memory_limit_mb: "256",
    languages: "cpp|python",
    scoring: "all_or_nothing",
    checker: "exact",
    source: "original",
    hint_1: "Use a set.",
    hint_2: "",
    hint_3: "",
    editorial: "",
    ...o,
  });

  it("reads a valid problem row", () => {
    const [row] = asRows(problemRow());
    const result = readProblemRow(row!, problemCtx, new Map());
    expect(result.action).toBe("CREATE");
    expect(result.value).toMatchObject({
      topicIds: ["t-arrays", "t-hash"],
      languages: ["cpp", "python"],
      hints: ["Use a set."],
    });
  });

  it("flags bad problem fields", () => {
    const [row] = asRows(
      problemRow({
        slug: "taken",
        topics: "graphs",
        languages: "cobol",
        checker: "fuzzy",
        time_limit_ms: "50",
      }),
    );
    const result = readProblemRow(row!, problemCtx, new Map());
    expect(errorColumns(result).sort()).toEqual([
      "checker",
      "languages",
      "slug",
      "time_limit_ms",
      "topics",
    ]);
  });

  it("needs enough sample and hidden tests per problem", () => {
    const ctx = { problems: new Map([["CODE-1", { id: "p-1" }]]), existing: new Map() };
    const test = (order: number, sample: boolean) => ({
      problem_id: "CODE-1",
      order: String(order),
      is_sample: sample ? "yes" : "no",
      input: "1",
      output: "1",
      explanation: "",
    });
    const few = validateTestCaseRows(asRows(test(1, true), test(2, false)), ctx);
    expect(few.every((r) => r.value === null)).toBe(true);
    const enough = validateTestCaseRows(
      asRows(
        test(1, true),
        ...Array.from({ length: MIN_HIDDEN_TESTS }, (_, i) => test(i + 2, false)),
      ),
      ctx,
    );
    expect(enough.every((r) => r.action === "CREATE")).toBe(true);
    const duplicate = validateTestCaseRows(
      asRows(test(1, true), ...Array.from({ length: MIN_HIDDEN_TESTS }, () => test(2, false))),
      ctx,
    );
    expect(errorColumns(duplicate[2]!)).toContain("order");
  });

  it("checks solutions: Java class name, allowed languages, duplicates", () => {
    const ctx = {
      problems: new Map([["CODE-1", { id: "p-1", languages: ["cpp", "java"] }]]),
      existing: new Map(),
    };
    const rows = validateSolutionRows(
      asRows(
        { problem_id: "CODE-1", kind: "reference", language: "java", code: "class Solution {}" },
        { problem_id: "CODE-1", kind: "starter", language: "python", code: "pass" },
        { problem_id: "CODE-1", kind: "reference", language: "cpp", code: "int main(){}" },
        { problem_id: "CODE-1", kind: "reference", language: "cpp", code: "int main(){}" },
      ),
      ctx,
    );
    expect(errorColumns(rows[0]!)).toEqual(["code"]);
    expect(errorColumns(rows[1]!)).toEqual(["language"]);
    expect(rows[2]!.action).toBe("CREATE");
    expect(errorColumns(rows[3]!)).toEqual(["language"]);
  });
});
