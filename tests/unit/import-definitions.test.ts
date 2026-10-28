import { describe, expect, it } from "vitest";
import {
  validateMapRows,
  validateRoundRows,
  validateSectionRows,
  validateSourceRows,
} from "@/server/imports/definitions/company-details";
import { validateCompanyRows } from "@/server/imports/definitions/companies";
import { validatePassageRows } from "@/server/imports/definitions/passages";
import { validateTaxonomyRows } from "@/server/imports/definitions/taxonomy";
import type { ParsedRow } from "@/server/imports/parse";

const today = new Date(Date.UTC(2026, 9, 19));
const asRows = (...cells: Record<string, string>[]): ParsedRow[] =>
  cells.map((c, i) => ({ rowNumber: i + 2, cells: c }));
const errorColumns = (row: { messages: { level: string; column?: string }[] }) =>
  row.messages.filter((m) => m.level === "error").map((m) => m.column);

describe("taxonomy import", () => {
  const empty = { subjects: new Map(), topics: new Map(), subtopics: new Map() };
  const row = (o: Record<string, string> = {}) => ({
    subject_slug: "quantitative-aptitude",
    subject_name: "Quantitative Aptitude",
    topic_slug: "percentages",
    topic_name: "Percentages",
    subtopic_slug: "",
    subtopic_name: "",
    order: "",
    ...o,
  });

  it("creates new nodes and skips identical ones", () => {
    const [created] = validateTaxonomyRows(asRows(row()), empty);
    expect(created?.action).toBe("CREATE");
    const ctx = {
      subjects: new Map([["quantitative-aptitude", { name: "Quantitative Aptitude" }]]),
      topics: new Map([
        ["percentages", { name: "Percentages", order: 3, subjectSlug: "quantitative-aptitude" }],
      ]),
      subtopics: new Map(),
    };
    expect(validateTaxonomyRows(asRows(row()), ctx)[0]?.action).toBe("UNCHANGED");
    expect(validateTaxonomyRows(asRows(row({ topic_name: "Percentage" })), ctx)[0]?.action).toBe(
      "UPDATE",
    );
  });

  it("rejects a topic slug reused under another subject", () => {
    const results = validateTaxonomyRows(
      asRows(row(), row({ subject_slug: "dsa", subject_name: "DSA" })),
      empty,
    );
    expect(errorColumns(results[1]!)).toContain("topic_slug");
  });

  it("rejects moving an existing topic to another subject", () => {
    const ctx = {
      ...empty,
      topics: new Map([["percentages", { name: "Percentages", order: 0, subjectSlug: "dsa" }]]),
    };
    expect(errorColumns(validateTaxonomyRows(asRows(row()), ctx)[0]!)).toContain("topic_slug");
  });

  it("requires subtopic name and slug together", () => {
    expect(
      errorColumns(validateTaxonomyRows(asRows(row({ subtopic_slug: "basics" })), empty)[0]!),
    ).toContain("subtopic_name");
  });
});

it("validates passages and duplicate IDs", () => {
  const results = validatePassageRows(
    asRows(
      { external_id: "PSG-1", title: "T", body: "Body" },
      { external_id: "PSG-1", title: "T", body: "" },
    ),
    { existing: new Map() },
    new Map(),
  );
  expect(results[0]?.action).toBe("CREATE");
  expect(errorColumns(results[1]!)).toEqual(expect.arrayContaining(["external_id", "body"]));
});

describe("company import", () => {
  const company = {
    slug: "acme",
    name: "Acme",
    level: "full",
    category: "service",
    hiring_for: "fresher|experienced",
    overview: "Overview",
    website: "",
    careers_url: "https://acme.example/careers",
    ctc_fresher: "3.5 LPA",
    ctc_experienced: "",
    min_cgpa: "6.5",
    min_10th_percent: "60",
    min_12th_percent: "60",
    max_backlogs: "0",
    max_gap_years: "",
    branches: "cse|IT|any",
    grad_years: "2027|2026",
    last_verified: "2026-10-01",
  };

  it("parses a full profile", () => {
    const [row] = validateCompanyRows(asRows(company), { existing: new Map(), today });
    expect(row?.messages).toEqual([]);
    expect(row?.value).toMatchObject({
      level: "FULL",
      hiringFor: ["FRESHER", "EXPERIENCED"],
      minCgpa: 6.5,
      branches: [],
      gradYears: [2026, 2027],
    });
  });

  it("rejects bad enums, links and future verification dates", () => {
    const [row] = validateCompanyRows(
      asRows({
        ...company,
        level: "premium",
        hiring_for: "intern",
        careers_url: "ftp://x",
        last_verified: "2027-01-01",
        min_cgpa: "11",
      }),
      { existing: new Map(), today },
    );
    expect(errorColumns(row!)).toEqual(
      expect.arrayContaining(["level", "hiring_for", "careers_url", "last_verified", "min_cgpa"]),
    );
  });
});

describe("company details import", () => {
  const companies = new Map([["acme", { id: "c-1" }]]);

  it("validates rounds", () => {
    const [ok, bad] = validateRoundRows(
      asRows(
        {
          company: "acme",
          round_order: "1",
          round_name: "OA",
          round_type: "online-test",
          platform: "tcs-ion",
          duration_min: "90",
          is_elimination: "yes",
          description: "",
        },
        {
          company: "nobody",
          round_order: "0",
          round_name: "",
          round_type: "quiz",
          platform: "zoom",
          duration_min: "",
          is_elimination: "maybe",
          description: "",
        },
      ),
      { companies, existing: new Map() },
    );
    expect(ok?.value).toMatchObject({ companyId: "c-1", type: "ONLINE_TEST", isElimination: true });
    expect(errorColumns(bad!)).toEqual(
      expect.arrayContaining([
        "company",
        "round_order",
        "round_name",
        "round_type",
        "platform",
        "is_elimination",
      ]),
    );
  });

  it("validates sections against rounds and topics", () => {
    const ctx = {
      companies,
      rounds: new Map([["acme/1", { id: "r-1" }]]),
      topics: new Map([["percentages", { id: "t-1" }]]),
      existing: new Map(),
    };
    const base = {
      company: "acme",
      round_order: "1",
      section_order: "1",
      section_name: "Quant",
      section_type: "mcq",
      question_count: "20",
      minutes: "25",
      negative_marks: "0.25",
      can_go_back: "no",
      topics: "percentages",
    };
    const [ok, bad] = validateSectionRows(
      asRows(base, { ...base, round_order: "2", section_order: "2", topics: "astrology" }),
      ctx,
    );
    expect(ok?.value).toMatchObject({
      roundId: "r-1",
      negativeMarks: 0.25,
      canGoBack: false,
      topicIds: ["t-1"],
    });
    expect(errorColumns(bad!)).toEqual(expect.arrayContaining(["round_order", "topics"]));
  });

  it("validates sources", () => {
    const [row] = validateSourceRows(
      asRows({
        company: "acme",
        label: "Careers",
        url: "https://acme.example",
        checked_on: "2026-10-01",
      }),
      { companies, existing: new Map(), today },
    );
    expect(row?.action).toBe("CREATE");
  });

  it("maps questions and coding problems to companies", () => {
    const ctx = {
      companies,
      questions: new Map([["QA-1", { id: "q-1" }]]),
      problems: new Map([["CODE-1", { id: "p-1" }]]),
      rounds: new Set(["acme/1"]),
      existing: new Map(),
      today,
    };
    const [ok, coding, unknown, noRound] = validateMapRows(
      asRows(
        {
          company: "acme",
          item_type: "mcq",
          item_id: "QA-1",
          round_order: "1",
          asked_in: "2026-08|2025-09",
          report_count: "12",
        },
        {
          company: "acme",
          item_type: "coding",
          item_id: "CODE-1",
          round_order: "",
          asked_in: "",
          report_count: "",
        },
        {
          company: "acme",
          item_type: "mcq",
          item_id: "QA-404",
          round_order: "",
          asked_in: "",
          report_count: "",
        },
        {
          company: "acme",
          item_type: "mcq",
          item_id: "QA-1",
          round_order: "3",
          asked_in: "",
          report_count: "",
        },
      ),
      ctx,
    );
    expect(ok?.value).toEqual({
      companyId: "c-1",
      questionId: "q-1",
      problemId: null,
      roundOrder: 1,
      askedIn: ["2026-08", "2025-09"],
      reportCount: 12,
    });
    expect(coding?.value).toMatchObject({ questionId: null, problemId: "p-1" });
    expect(errorColumns(unknown!)).toContain("item_id");
    // Same company + question twice is an error; the missing round alone would only warn.
    expect(errorColumns(noRound!)).toContain("item_id");
    expect(noRound?.messages.some((m) => m.level === "warning" && m.column === "round_order")).toBe(
      true,
    );
  });
});
