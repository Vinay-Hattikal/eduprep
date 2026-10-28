// Row rules of the single-file formats (D-054): coding problems in one row, a company's rounds and
// sections in one file, sources in companies.csv, and MCQ IDs, duplicates and company tags.

import { describe, expect, it } from "vitest";
import {
  readBundleRow,
  type BundleContext,
  type BundleValue,
} from "@/server/imports/definitions/coding-bundle";
import { validateCompanyRows } from "@/server/imports/definitions/companies";
import {
  validateProcessRows,
  type ProcessContext,
} from "@/server/imports/definitions/company-process";
import {
  derivedMcqId,
  mcqContentKey,
  validateMcqRows,
  type McqContext,
} from "@/server/imports/definitions/mcq";
import type { ParsedRow } from "@/server/imports/parse";
import type { ValidatedRow } from "@/server/imports/types";

const today = new Date(Date.UTC(2026, 9, 23));
const errors = (r: { messages: { level: string; column?: string }[] }) =>
  r.messages.filter((m) => m.level === "error").map((m) => m.column);
const warnings = (r: { messages: { level: string; message: string }[] }) =>
  r.messages.filter((m) => m.level === "warning").map((m) => m.message);

// ---------- coding: one row per problem ----------

const problem: Record<string, string> = {
  external_id: "",
  title: "Sum of Two",
  slug: "sum-of-two",
  difficulty: "easy",
  topics: "arrays",
  statement: "Print the sum of **two** integers.",
  input_format: "Two integers.",
  output_format: "Their sum.",
  constraints: "$|a|, |b| \\le 10^9$",
  time_limit_ms: "1000",
  memory_limit_mb: "256",
  languages: "python|cpp",
  scoring: "all_or_nothing",
  checker: "exact",
  source: "original",
  solution_language: "python",
  solution_code: "a, b = map(int, input().split())\nprint(a + b)\n",
  starter_python: "# read two numbers\n",
  sample_1_input: "1 2\n",
  sample_1_output: "3\n",
  sample_1_explanation: "1 + 2 = 3",
  ...Object.fromEntries(
    [1, 2, 3, 4, 5].flatMap((i) => [
      [`test_${i}_input`, `${i} ${i}\n`],
      [`test_${i}_output`, `${2 * i}\n`],
    ]),
  ),
  companies: "",
  asked_in: "",
};

function bundleContext(overrides: Partial<BundleContext> = {}): BundleContext {
  return {
    topics: new Map([["arrays", { id: "t-arr" }]]),
    existing: new Map(),
    slugs: new Map(),
    content: new Map(),
    statements: new Map(),
    companies: new Map([["acme", { id: "c-acme" }]]),
    companyColumn: true,
    today,
    ...overrides,
  };
}

function readBundle(cells: Record<string, string>[], ctx = bundleContext()) {
  const seen = { ids: new Map<string, number>(), statements: new Map<string, number>() };
  return cells.map((c, i) =>
    readBundleRow({ rowNumber: i + 2, cells: { ...problem, ...c } }, ctx, seen),
  );
}

/** The context as it would look after importing `row`. */
function savedContext(row: ValidatedRow<BundleValue>, extra: Partial<BundleContext> = {}) {
  const v = row.value!;
  return bundleContext({
    existing: new Map([[v.problem.externalId, { ...v.problem, id: "p-1" }]]),
    slugs: new Map([[v.problem.slug, v.problem.externalId]]),
    content: new Map([
      [
        v.problem.externalId,
        {
          status: "DRAFT",
          tests: v.tests,
          solutions: v.solutions,
          links: (v.links?.companyIds ?? []).map((companyId) => ({
            companyId,
            askedIn: v.links?.askedIn ?? [],
          })),
        },
      ],
    ]),
    ...extra,
  });
}

describe("coding problems in one row", () => {
  it("reads the problem, tests, solutions and companies from one row", () => {
    const [row] = readBundle([{ companies: "acme", asked_in: "2026-08" }]);
    expect(row!.messages).toEqual([]);
    expect(row!.action).toBe("CREATE");
    const v = row!.value!;
    expect(v.problem.externalId).toBe("sum-of-two"); // no ID given: the slug is the ID
    expect(v.tests.map((t) => [t.order, t.isSample])).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, false],
      [5, false],
      [6, false],
    ]);
    expect(v.tests[0]!.explanation).toBe("1 + 2 = 3");
    expect(v.solutions.map((s) => `${s.kind}:${s.language}`)).toEqual([
      "REFERENCE:python",
      "STARTER:python",
    ]);
    expect(v.links).toEqual({ companyIds: ["c-acme"], askedIn: ["2026-08"] });
  });

  it("requires a reference solution, one sample and five hidden tests", () => {
    const [row] = readBundle([
      {
        solution_code: "",
        solution_language: "",
        sample_1_input: "",
        sample_1_output: "",
        test_5_input: "",
        test_5_output: "",
      },
    ]);
    expect(row!.value).toBeNull();
    expect(errors(row!)).toEqual(
      expect.arrayContaining(["solution_code", "sample_1_output", "test_1_output"]),
    );
  });

  it("rejects starter code for a language the problem doesn't allow, and Java without Main", () => {
    const [row] = readBundle([
      { starter_java: "class Solution {}", solution_language: "java", solution_code: "class X {}" },
    ]);
    expect(errors(row!)).toEqual(expect.arrayContaining(["starter_java", "solution_code"]));
  });

  it("needs an output for every test that has an input", () => {
    const [row] = readBundle([{ test_6_input: "9 9\n" }]);
    expect(errors(row!)).toContain("test_6_output");
  });

  it("warns when a test looks cut by Excel", () => {
    const [row] = readBundle([{ test_1_input: "x".repeat(32_767) }]);
    expect(row!.action).toBe("CREATE");
    expect(warnings(row!).join()).toMatch(/32,767/);
  });

  it("blocks the same statement under another ID, in the file and in the bank", () => {
    const [, second] = readBundle([{}, { slug: "sum-again", title: "Sum again" }]);
    expect(errors(second!)).toContain("statement");

    const ctx = bundleContext({
      statements: new Map([["print the sum of two integers.", "CODE-OLD-1"]]),
    });
    const [row] = readBundle([{}], ctx);
    expect(row!.messages.find((m) => m.column === "statement")?.message).toMatch(/CODE-OLD-1/);
  });

  it("re-uploading the same row changes nothing; a new test updates it", () => {
    const [first] = readBundle([{}]);
    const ctx = savedContext(first!);
    expect(readBundle([{}], ctx)[0]!.action).toBe("UNCHANGED");
    const [changed] = readBundle([{ test_6_input: "7 7\n", test_6_output: "14\n" }], ctx);
    expect(changed!.action).toBe("UPDATE");
    expect(changed!.value!.contentChanged).toBe(true);
    expect(changed!.existingId).toBe("p-1");
  });

  it("a change to companies only leaves the problem itself alone", () => {
    const [first] = readBundle([{}]);
    const [row] = readBundle([{ companies: "acme" }], savedContext(first!));
    expect(row!.action).toBe("UPDATE");
    expect(row!.value!.contentChanged).toBe(false);
  });

  it("warns about companies it unlinks, and errors on unknown ones", () => {
    const [first] = readBundle([{ companies: "acme" }]);
    const [row] = readBundle([{ companies: "" }], savedContext(first!));
    expect(warnings(row!).join()).toMatch(/Unlinks acme/);
    expect(errors(readBundle([{ companies: "nope" }])[0]!)).toContain("companies");
  });

  it("finds a problem by its slug when the ID is left blank", () => {
    const [first] = readBundle([{ external_id: "CODE-SUM-1" }]);
    const [row] = readBundle([{ external_id: "" }], savedContext(first!));
    expect(row!.value!.problem.externalId).toBe("CODE-SUM-1");
    expect(row!.action).toBe("UNCHANGED");
  });

  it("brings an archived problem back as a draft", () => {
    const [first] = readBundle([{}]);
    const ctx = savedContext(first!);
    ctx.content.get("sum-of-two")!.status = "ARCHIVED";
    const [row] = readBundle([{}], ctx);
    expect(row!.action).toBe("UPDATE");
    expect(warnings(row!).join()).toMatch(/archived/);
  });
});

// ---------- company rounds and sections ----------

const processRow = (cells: Partial<Record<string, string>>, i: number): ParsedRow => ({
  rowNumber: i + 2,
  cells: {
    company: "acme",
    round_order: "1",
    round_name: "",
    round_type: "",
    platform: "",
    duration_min: "",
    is_elimination: "",
    round_description: "",
    section_order: "",
    section_name: "",
    section_type: "",
    question_count: "",
    minutes: "",
    negative_marks: "",
    can_go_back: "",
    topics: "",
    ...(cells as Record<string, string>),
  },
});

const section = (order: string, name: string) => ({
  section_order: order,
  section_name: name,
  section_type: "mcq",
  question_count: "20",
  minutes: "25",
  topics: "percentages",
});

const processCtx = (overrides: Partial<ProcessContext> = {}): ProcessContext => ({
  companies: new Map([
    ["acme", { id: "c-acme" }],
    ["globex", { id: "c-globex" }],
  ]),
  topics: new Map([["percentages", { id: "t-pct" }]]),
  existing: new Map(),
  ...overrides,
});

describe("company rounds and sections in one file", () => {
  const sample = [
    {
      round_name: "Online test",
      round_type: "online-test",
      platform: "tcs-ion",
      ...section("1", "Numerical"),
    },
    { ...section("2", "Reasoning") },
    { round_order: "2", round_name: "Technical interview", round_type: "technical-interview" },
  ];

  it("groups sections under their round; details are written once", () => {
    const rows = validateProcessRows(sample.map(processRow), processCtx());
    expect(rows.map((r) => r.messages)).toEqual([[], [], []]);
    expect(rows.map((r) => r.action)).toEqual(["CREATE", "CREATE", "CREATE"]);
    const plan = rows[0]!.value!.plan;
    expect(plan.rounds.map((r) => [r.order, r.name, r.sections.map((s) => s.name)])).toEqual([
      [1, "Online test", ["Numerical", "Reasoning"]],
      [2, "Technical interview", []],
    ]);
  });

  it("needs round details once, and rejects rows that contradict them", () => {
    const rows = validateProcessRows(
      [
        { ...section("1", "A") },
        { round_order: "2", round_name: "Test", round_type: "online-test", ...section("1", "B") },
        {
          round_order: "2",
          round_name: "Other name",
          round_type: "online-test",
          ...section("2", "C"),
        },
      ].map(processRow),
      processCtx(),
    );
    expect(errors(rows[0]!)).toContain("round_name");
    expect(errors(rows[2]!)).toContain("round_name");
  });

  it("holds back a whole company when one of its rows is wrong, not other companies", () => {
    const rows = validateProcessRows(
      [
        { round_name: "Test", round_type: "online-test", ...section("1", "A") },
        { ...section("2", "B"), topics: "unknown-topic" },
        { company: "globex", round_name: "Test", round_type: "online-test" },
      ].map(processRow),
      processCtx(),
    );
    expect(rows[0]!.value).toBeNull();
    expect(rows[0]!.messages[0]!.message).toMatch(/row 3/);
    expect(rows[2]!.action).toBe("CREATE");
  });

  it("re-uploading changes nothing; removing a section is announced and applied", () => {
    const first = validateProcessRows(sample.map(processRow), processCtx());
    const existing = new Map([["c-acme", first[0]!.value!.plan.rounds]]);
    const again = validateProcessRows(sample.map(processRow), processCtx({ existing }));
    expect(again.map((r) => r.action)).toEqual(["UNCHANGED", "UNCHANGED", "UNCHANGED"]);

    const fewer = validateProcessRows(
      [sample[0]!, sample[2]!].map(processRow),
      processCtx({ existing }),
    );
    expect(fewer[0]!.action).toBe("UPDATE");
    expect(warnings(fewer[0]!).join()).toMatch(/section 2 \(Reasoning\)/);
  });
});

// ---------- companies.csv with sources ----------

const companyCells = {
  slug: "acme",
  name: "Acme",
  level: "standard",
  category: "service",
  hiring_for: "fresher",
  overview: "Makes things.",
  last_verified: "2026-10-01",
};

describe("company sources in companies.csv", () => {
  const asRows = (cells: Record<string, string>) => [
    { rowNumber: 2, cells: { ...companyCells, ...cells } },
  ];

  it("reads up to three sources and needs at least one", () => {
    const [ok] = validateCompanyRows(
      asRows({
        source_1_label: "Careers page",
        source_1_url: "https://acme.example/careers",
        source_1_checked_on: "2026-10-01",
      }),
      { existing: new Map(), today, sourceColumns: true },
    );
    expect(ok!.value!.sources).toEqual([
      {
        label: "Careers page",
        url: "https://acme.example/careers",
        checkedOn: new Date("2026-10-01"),
      },
    ]);
    const [none] = validateCompanyRows(asRows({}), {
      existing: new Map(),
      today,
      sourceColumns: true,
    });
    expect(errors(none!)).toContain("source_1_url");
  });

  it("files without source columns leave sources alone", () => {
    const [row] = validateCompanyRows(asRows({}), { existing: new Map(), today });
    expect(row!.value!.sources).toBeNull();
  });
});

// ---------- MCQ: optional IDs, exact duplicates, company tags ----------

const mcq = {
  external_id: "",
  subject: "quantitative-aptitude",
  topic: "percentages",
  subtopic: "",
  type: "single",
  question: "What is 10% of 50?",
  code: "",
  code_language: "",
  option_a: "5",
  option_b: "10",
  option_c: "",
  option_d: "",
  option_e: "",
  correct: "A",
  tolerance: "",
  explanation: "10% of 50 is 50 / 10 = 5.",
  difficulty: "easy",
  expected_time_sec: "30",
  passage_id: "",
  tags: "",
  source: "original",
  companies: "",
  asked_in: "",
};

function mcqContext(overrides: Partial<McqContext> = {}): McqContext {
  return {
    subjects: new Map([["quantitative-aptitude", { id: "s-qa" }]]),
    topics: new Map([["percentages", { id: "t-pct", subjectSlug: "quantitative-aptitude" }]]),
    subtopics: new Map(),
    passages: new Map(),
    existing: new Map(),
    topicAverages: new Map(),
    findSimilar: async () => null,
    byContent: new Map(),
    companyColumn: true,
    companies: new Map([["acme", { id: "c-acme" }]]),
    links: new Map(),
    today,
    ...overrides,
  };
}

const mcqRows = (...overrides: Partial<typeof mcq>[]): ParsedRow[] =>
  overrides.map((o, i) => ({ rowNumber: i + 2, cells: { ...mcq, ...o } }));

describe("MCQ IDs, duplicates and companies", () => {
  const key = mcqContentKey({
    text: mcq.question,
    options: ["5", "10"],
    code: null,
    passage: null,
  });

  it("gives a row without an ID a stable ID from its content", async () => {
    const [a] = await validateMcqRows(mcqRows({}), mcqContext(), new Map());
    const [b] = await validateMcqRows(mcqRows({}), mcqContext(), new Map());
    expect(a!.value!.externalId).toBe(derivedMcqId("quantitative-aptitude", key));
    expect(b!.value!.externalId).toBe(a!.value!.externalId);
    expect(a!.value!.externalId).toMatch(/^quantitative-aptitude-[a-f0-9]{12}$/);
  });

  it("matches a row without an ID to the same saved question", async () => {
    const [row] = await validateMcqRows(
      mcqRows({}),
      mcqContext({ byContent: new Map([[key, "QA-PCT-0001"]]) }),
      new Map(),
    );
    expect(row!.value!.externalId).toBe("QA-PCT-0001");
  });

  it("refuses exact duplicates: in the file, and of a saved question with another ID", async () => {
    const [, second] = await validateMcqRows(
      mcqRows({ external_id: "QA-1" }, { external_id: "QA-2", question: "What is 10%  of 50?" }),
      mcqContext(),
      new Map(),
    );
    expect(second!.value).toBeNull();
    expect(second!.messages.find((m) => m.column === "question")?.message).toMatch(/row 2/);

    const [dup] = await validateMcqRows(
      mcqRows({ external_id: "QA-NEW" }),
      mcqContext({ byContent: new Map([[key, "QA-PCT-0001"]]) }),
      new Map(),
    );
    expect(dup!.messages.find((m) => m.column === "question")?.message).toMatch(/QA-PCT-0001/);
  });

  it("allows the same text with different options (not a duplicate)", async () => {
    const rows = await validateMcqRows(
      mcqRows({ external_id: "QA-1" }, { external_id: "QA-2", option_b: "20" }),
      mcqContext(),
      new Map(),
    );
    expect(rows[1]!.value).not.toBeNull();
    expect(warnings(rows[1]!).join()).toMatch(/Same question text as row 2/);
  });

  it("tags companies, and a tag-only change keeps the question as it is", async () => {
    const [first] = await validateMcqRows(
      mcqRows({ external_id: "QA-1" }),
      mcqContext(),
      new Map(),
    );
    const saved = {
      ...first!.value!,
      id: "q-1",
      subjectSlug: "quantitative-aptitude",
      status: "PUBLISHED" as const,
      version: 2,
      reviewNote: null,
      reviewerId: null,
      submittedAt: null,
      publishedAt: null,
      importBatchId: null,
    };
    const [row] = await validateMcqRows(
      mcqRows({ external_id: "QA-1", companies: "acme", asked_in: "2026-09" }),
      mcqContext({ existing: new Map([["QA-1", saved]]) }),
      new Map(),
    );
    expect(row!.action).toBe("UPDATE");
    expect(row!.value!.contentChanged).toBe(false);
    expect(row!.value!.links).toEqual({ companyIds: ["c-acme"], askedIn: ["2026-09"] });
  });
});
