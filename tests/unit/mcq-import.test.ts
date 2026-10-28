import { describe, expect, it } from "vitest";
import { validateMcqRows, type McqContext } from "@/server/imports/definitions/mcq";
import type { ParsedRow } from "@/server/imports/parse";

const base = {
  external_id: "QA-PCT-0001",
  subject: "quantitative-aptitude",
  topic: "percentages",
  subtopic: "",
  type: "single",
  question: "A price rises 20% and falls 20%. Net change?",
  code: "",
  code_language: "",
  option_a: "No change",
  option_b: "4% decrease",
  option_c: "4% increase",
  option_d: "",
  option_e: "",
  correct: "B",
  tolerance: "",
  explanation: "Net change = 20 - 20 - 20*20/100 = -4%, a 4% decrease.",
  difficulty: "easy",
  expected_time_sec: "45",
  passage_id: "",
  tags: "formula",
  source: "original",
};

function rows(...overrides: Partial<typeof base>[]): ParsedRow[] {
  return overrides.map((o, i) => ({ rowNumber: i + 2, cells: { ...base, ...o } }));
}

function context(overrides: Partial<McqContext> = {}): McqContext {
  return {
    subjects: new Map([
      ["quantitative-aptitude", { id: "s-qa" }],
      ["logical-reasoning", { id: "s-lr" }],
    ]),
    topics: new Map([
      ["percentages", { id: "t-pct", subjectSlug: "quantitative-aptitude" }],
      ["syllogism", { id: "t-syl", subjectSlug: "logical-reasoning" }],
    ]),
    subtopics: new Map([["percentages/successive-change", { id: "st-sc" }]]),
    passages: new Map([["PSG-1", { id: "p-1" }]]),
    existing: new Map(),
    topicAverages: new Map(),
    findSimilar: async () => null,
    ...overrides,
  };
}

const errors = (r: { messages: { level: string; column?: string }[] }) =>
  r.messages.filter((m) => m.level === "error").map((m) => m.column);

describe("validateMcqRows", () => {
  it("accepts a valid row as a new question with resolved IDs", async () => {
    const [row] = await validateMcqRows(rows({}), context(), new Map());
    expect(row?.messages).toEqual([]);
    expect(row?.action).toBe("CREATE");
    expect(row?.value).toMatchObject({
      externalId: "QA-PCT-0001",
      subjectId: "s-qa",
      topicId: "t-pct",
      type: "SINGLE",
      options: ["No change", "4% decrease", "4% increase"],
      correctOptions: ["B"],
      difficulty: "EASY",
      tags: ["formula"],
      source: "ORIGINAL",
    });
  });

  it("reads numeric and multiple-answer rows", async () => {
    const [numeric, multiple] = await validateMcqRows(
      rows(
        {
          external_id: "QA-AVG-1",
          type: "numeric",
          option_a: "",
          option_b: "",
          option_c: "",
          correct: "26",
          tolerance: "0.5",
        },
        { external_id: "QA-MUL-1", type: "multiple", correct: "a|C" },
      ),
      context(),
      new Map(),
    );
    expect(numeric?.value).toMatchObject({
      type: "NUMERIC",
      numericAnswer: 26,
      tolerance: 0.5,
      options: [],
      correctOptions: [],
    });
    expect(multiple?.value?.correctOptions).toEqual(["A", "C"]);
  });

  it("reports each problem against its column", async () => {
    const [row] = await validateMcqRows(
      rows({
        topic: "syllogism",
        difficulty: "tough",
        correct: "E",
        expected_time_sec: "abc",
        source: "copied",
      }),
      context(),
      new Map(),
    );
    expect(row?.value).toBeNull();
    expect(errors(row!)).toEqual(
      expect.arrayContaining(["topic", "difficulty", "expected_time_sec", "source"]),
    );
  });

  it("requires one subject per file and unique IDs", async () => {
    const results = await validateMcqRows(
      rows(
        {},
        { external_id: "QA-PCT-0001" },
        { external_id: "LR-1", subject: "logical-reasoning", topic: "syllogism" },
      ),
      context(),
      new Map(),
    );
    expect(errors(results[1]!)).toContain("external_id");
    expect(errors(results[2]!)).toContain("subject");
  });

  it("rejects unknown taxonomy and passages", async () => {
    const [row] = await validateMcqRows(
      rows({ subject: "astrology", topic: "stars", subtopic: "x", passage_id: "PSG-404" }),
      context(),
      new Map(),
    );
    expect(errors(row!)).toEqual(expect.arrayContaining(["subject", "topic", "passage_id"]));
  });

  it("marks unchanged and updated rows", async () => {
    const [first] = await validateMcqRows(rows({}), context(), new Map());
    const existing = {
      ...first!.value!,
      id: "q-1",
      subjectSlug: "quantitative-aptitude",
      status: "PUBLISHED" as const,
      version: 3,
      reviewNote: null,
      reviewerId: null,
      submittedAt: null,
      publishedAt: null,
      importBatchId: null,
    };
    const ctx = context({ existing: new Map([["QA-PCT-0001", existing]]) });
    const [same, changed] = await validateMcqRows(
      rows({}, { external_id: "QA-PCT-0001", difficulty: "hard" }),
      ctx,
      new Map(),
    );
    expect(same?.action).toBe("UNCHANGED");
    expect(same?.existingId).toBe("q-1");
    // The second row repeats the ID, so it's an error; check UPDATE on its own:
    const [updated] = await validateMcqRows(rows({ difficulty: "hard" }), ctx, new Map());
    expect(updated?.action).toBe("UPDATE");
    expect(changed?.action).toBeNull();
  });

  it("stops an ID being reused by another subject", async () => {
    const existing = { id: "q-9", subjectSlug: "logical-reasoning" } as never;
    const [row] = await validateMcqRows(
      rows({}),
      context({ existing: new Map([["QA-PCT-0001", existing]]) }),
      new Map(),
    );
    expect(errors(row!)).toContain("external_id");
  });

  it("warns about likely duplicates without blocking the row", async () => {
    const ctx = context({ findSimilar: async () => ({ externalId: "QA-OLD-7", score: 0.93 }) });
    const [row] = await validateMcqRows(rows({}), ctx, new Map());
    expect(row?.action).toBe("CREATE");
    expect(row?.messages[0]).toMatchObject({ level: "warning", column: "question" });
    expect(row?.messages[0]?.message).toMatch(/QA-OLD-7 \(93% match\)/);
  });

  it("rewrites image links to stored assets and rejects missing images", async () => {
    const assets = new Map([["chart.png", new Uint8Array([1, 2, 3])]]);
    const [ok, missing] = await validateMcqRows(
      rows(
        { question: "Look: ![chart](assets/chart.png)" },
        { external_id: "QA-2", question: "Look: ![x](assets/nope.png)" },
      ),
      context(),
      assets,
    );
    expect(ok?.value?.text).toMatch(/^Look: !\[chart\]\(\/api\/assets\/[a-f0-9]{64}\.png\)$/);
    expect(errors(missing!)).toContain("question");
  });
});
