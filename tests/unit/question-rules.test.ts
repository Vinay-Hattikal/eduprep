import { describe, expect, it } from "vitest";
import {
  checkQuestion,
  hasErrors,
  normalizeQuestionText,
  type QuestionContent,
} from "@/lib/content/question-rules";

const single: QuestionContent = {
  type: "SINGLE",
  text: "What is 2 + 2?",
  code: null,
  codeLanguage: null,
  options: ["3", "4", "5"],
  correctOptions: ["B"],
  numericAnswer: null,
  tolerance: null,
  explanation: "Adding two and two gives four, by counting on.",
  expectedTimeSec: 30,
};

const errorFields = (q: QuestionContent) =>
  checkQuestion(q)
    .filter((i) => i.level === "error")
    .map((i) => i.field);

describe("checkQuestion", () => {
  it("accepts a valid single-answer question", () => {
    expect(checkQuestion(single)).toEqual([]);
  });

  it("accepts a valid multiple-answer question", () => {
    expect(
      hasErrors(checkQuestion({ ...single, type: "MULTIPLE", correctOptions: ["A", "B"] })),
    ).toBe(false);
  });

  it("accepts a valid numeric question", () => {
    const numeric = {
      ...single,
      type: "NUMERIC" as const,
      options: [],
      correctOptions: [],
      numericAnswer: 4,
      tolerance: 0,
    };
    expect(checkQuestion(numeric)).toEqual([]);
  });

  it.each<[string, Partial<QuestionContent>, string]>([
    ["missing text", { text: "  " }, "text"],
    ["missing explanation", { explanation: "" }, "explanation"],
    ["gap in options", { options: ["3", "", "5"], correctOptions: ["A"] }, "options"],
    ["fewer than 2 options", { options: ["4"], correctOptions: ["A"] }, "options"],
    ["duplicate options (case and spacing)", { options: ["Four", " four ", "5"] }, "options"],
    ["no correct answer", { correctOptions: [] }, "correctOptions"],
    ["two answers on a single question", { correctOptions: ["A", "B"] }, "correctOptions"],
    ["answer pointing to an empty option", { correctOptions: ["D"] }, "correctOptions"],
    ["time too short", { expectedTimeSec: 5 }, "expectedTimeSec"],
    ["time not whole", { expectedTimeSec: 30.5 }, "expectedTimeSec"],
    ["code without language", { code: "print(1)" }, "codeLanguage"],
    ["unknown code language", { code: "x", codeLanguage: "cobol" }, "codeLanguage"],
  ])("rejects %s", (_name, change, field) => {
    expect(errorFields({ ...single, ...change })).toContain(field);
  });

  it("rejects numeric questions with options or no answer", () => {
    const numeric = {
      ...single,
      type: "NUMERIC" as const,
      correctOptions: [],
      numericAnswer: null,
    };
    expect(errorFields(numeric)).toEqual(expect.arrayContaining(["options", "numericAnswer"]));
  });

  it("warns about short explanations and all-correct multiple choice", () => {
    const issues = checkQuestion({
      ...single,
      type: "MULTIPLE",
      correctOptions: ["A", "B", "C"],
      explanation: "Because.",
    });
    expect(issues.map((i) => [i.level, i.field])).toEqual([
      ["warning", "explanation"],
      ["warning", "correctOptions"],
    ]);
  });
});

it("normalises question text for duplicate checks", () => {
  expect(normalizeQuestionText("What is  **2 + 2**?\n")).toBe(
    normalizeQuestionText("what is 2 + 2?"),
  );
});
