import { describe, expect, it } from "vitest";
import { questionTitle, questionUrl, toPublicQuestion } from "@/lib/content/public-question";

const stored = {
  externalId: "QA-PCT-0042",
  type: "SINGLE" as const,
  text: "What is **20%** of $50$?",
  code: null,
  codeLanguage: null,
  options: ["10", "20", "", ""],
  difficulty: "EASY" as const,
  correctOptions: ["A"],
  numericAnswer: null,
  tolerance: null,
  explanation: "One fifth of 50 is 10.",
};

describe("toPublicQuestion (D-058)", () => {
  it("never carries the answer of a question that isn't a public sample", () => {
    const question = toPublicQuestion({ ...stored, publicSample: false });
    expect(question.answer).toBeNull();
    const json = JSON.stringify(question);
    expect(json).not.toContain("One fifth");
    expect(json).not.toContain("correctOptions");
  });

  it("shows the answer and explanation of a public sample", () => {
    expect(toPublicQuestion({ ...stored, publicSample: true }).answer).toEqual({
      correctOptions: ["A"],
      numericAnswer: null,
      tolerance: null,
      explanation: "One fifth of 50 is 10.",
    });
  });

  it("drops empty trailing options and lower-cases the URL", () => {
    const question = toPublicQuestion({ ...stored, publicSample: false });
    expect(question.options).toEqual(["10", "20"]);
    expect(questionUrl(question.externalId)).toBe("/question/qa-pct-0042");
  });
});

describe("questionTitle", () => {
  it("strips Markdown and LaTeX and shortens at a word", () => {
    expect(questionTitle(stored.text)).toBe("What is 20% of 50?");
    const long = questionTitle("word ".repeat(40), 50);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(51);
  });
});
