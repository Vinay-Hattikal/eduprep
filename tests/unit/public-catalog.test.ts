import { describe, expect, it } from "vitest";
import { mockSummary, toPublicProblem } from "@/lib/content/public-catalog";

describe("toPublicProblem (D-058)", () => {
  it("keeps sample tests and drops hidden ones", () => {
    const problem = toPublicProblem({
      slug: "pair-sum",
      title: "Pair sum",
      difficulty: "EASY",
      statement: "Find a pair.",
      inputFormat: "n t, then n numbers",
      outputFormat: "YES or NO",
      constraints: "n ≤ 10^5",
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      languages: ["python"],
      testCases: [
        { isSample: true, input: "2 3\n1 2", output: "YES", explanation: "1 + 2 = 3" },
        { isSample: false, input: "SECRET-INPUT", output: "SECRET-OUTPUT", explanation: null },
      ],
    });
    expect(problem.samples).toEqual([
      { input: "2 3\n1 2", output: "YES", explanation: "1 + 2 = 3" },
    ]);
    expect(JSON.stringify(problem)).not.toContain("SECRET");
  });
});

describe("mockSummary", () => {
  it("adds up questions, minutes and marks", () => {
    expect(
      mockSummary([
        {
          name: "Quant",
          type: "MCQ",
          minutes: 25,
          questions: 20,
          marksPerItem: 1,
          negativeMarks: 0.25,
          canGoBack: true,
        },
        {
          name: "Coding",
          type: "CODING",
          minutes: 45,
          questions: 2,
          marksPerItem: 10,
          negativeMarks: 0,
          canGoBack: true,
        },
      ]),
    ).toEqual({
      sections: 2,
      questions: 22,
      minutes: 70,
      marks: 40,
      negativeMarking: true,
      coding: true,
    });
  });
});
