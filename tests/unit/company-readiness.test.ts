import { describe, expect, it } from "vitest";
import {
  coverageNeeds,
  nextStep,
  readinessChecklist,
  splitAcrossTopics,
  type ReadinessInput,
} from "@/lib/content/company-readiness";
import { parseTestBlocks } from "@/lib/coding/test-blocks";

const t = (id: string) => ({ id, name: id.toUpperCase() });

describe("splitAcrossTopics", () => {
  it("shares a section's items evenly, the first topics taking the rest", () => {
    expect(splitAcrossTopics(7, [t("a"), t("b"), t("c")]).map((s) => s.count)).toEqual([3, 2, 2]);
    expect(splitAcrossTopics(2, [t("a"), t("b"), t("c")]).map((s) => s.topic.id)).toEqual([
      "a",
      "b",
    ]);
    expect(splitAcrossTopics(5, [])).toEqual([]);
  });
});

describe("coverageNeeds", () => {
  it("sums a topic over test sections and ignores interview rounds", () => {
    const needs = coverageNeeds([
      {
        type: "ONLINE_TEST",
        sections: [
          { type: "MCQ", questionCount: 10, topics: [t("pct"), t("avg")] },
          { type: "MCQ", questionCount: 4, topics: [t("pct")] },
        ],
      },
      { type: "CODING_TEST", sections: [{ type: "CODING", questionCount: 2, topics: [t("arr")] }] },
      {
        type: "TECHNICAL_INTERVIEW",
        sections: [{ type: "MCQ", questionCount: 50, topics: [t("pct")] }],
      },
    ]);
    expect(needs.get("MCQ:pct")?.need).toBe(9);
    expect(needs.get("MCQ:avg")?.need).toBe(5);
    expect(needs.get("CODING:arr")?.need).toBe(2);
  });
});

const ready: ReadinessInput = {
  status: "PUBLISHED",
  overview: "A".repeat(100),
  hiringFor: ["FRESHER"],
  stale: false,
  sources: 1,
  rounds: [
    { type: "ONLINE_TEST", sections: [{ type: "MCQ", questionCount: 2, topics: [t("pct")] }] },
  ],
  questions: { published: 2, draft: 0 },
  problems: { published: 0, draft: 0, checked: 0 },
  mocks: { published: 1, draft: 0 },
  coverage: [{ type: "MCQ", topicId: "pct", name: "PCT", need: 2, available: 2, tagged: 2 }],
};

describe("readinessChecklist", () => {
  it("is all done for a complete company without a coding round", () => {
    const items = readinessChecklist(ready);
    expect(items.filter((i) => !i.done)).toEqual([]);
    expect(nextStep(items)).toBeNull();
  });

  it("points a new company at its rounds first", () => {
    const items = readinessChecklist({
      ...ready,
      status: "DRAFT",
      sources: 0,
      rounds: [],
      questions: { published: 0, draft: 0 },
      mocks: { published: 0, draft: 0 },
      coverage: [],
    });
    expect(nextStep(items)).toMatchObject({ key: "process", tab: "process" });
    expect(items.find((i) => i.key === "sources")?.done).toBe(false);
  });

  it("names the short topic, and requires coding only with a coding round", () => {
    const items = readinessChecklist({
      ...ready,
      rounds: [
        ...ready.rounds,
        {
          type: "CODING_TEST",
          sections: [{ type: "CODING", questionCount: 1, topics: [t("arr")] }],
        },
      ],
      coverage: [
        ...ready.coverage,
        { type: "CODING", topicId: "arr", name: "Arrays", need: 1, available: 0, tagged: 0 },
      ],
    });
    expect(items.find((i) => i.key === "coding")?.done).toBe(false);
    const coverage = items.find((i) => i.key === "coverage")!;
    expect(coverage.done).toBe(false);
    expect(coverage.detail).toContain("Arrays 0/1");
    expect(coverage.next).toBe("Add problems in Arrays (0 of 1)");
  });
});

describe("parseTestBlocks", () => {
  it("reads input/output pairs separated by === and ---", () => {
    expect(parseTestBlocks("1 2\n===\n3\n---\n4 5\r\n===\r\n9\n")).toEqual({
      tests: [
        { input: "1 2", output: "3" },
        { input: "4 5", output: "9" },
      ],
    });
  });

  it("keeps blank lines that are part of a test", () => {
    expect(parseTestBlocks("a\n\nb\n===\n\nx")).toEqual({
      tests: [{ input: "a\n\nb", output: "\nx" }],
    });
  });

  it("explains what's wrong", () => {
    expect(parseTestBlocks("")).toEqual({ error: "Paste at least one test." });
    expect(parseTestBlocks("1 2\n3")).toMatchObject({ error: /Test 1: put a line with only ===/ });
    expect(parseTestBlocks("1\n===\n")).toMatchObject({ error: /Test 1: the expected output/ });
  });
});
