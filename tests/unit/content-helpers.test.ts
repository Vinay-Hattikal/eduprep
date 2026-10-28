import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findAssetReferences, rewriteAssetLinks } from "@/lib/content/assets";
import { isStale } from "@/lib/content/companies";
import { plainExcerpt } from "@/lib/format";
import { parseCsv } from "@/server/imports/parse";
import { IMPORT_DEFINITIONS } from "@/server/imports/registry";
import { backoffMs } from "@/server/jobs/retry";
import {
  changedFields,
  fromSnapshot,
  toSnapshot,
  type QuestionRecord,
} from "@/server/services/question-snapshot";

describe("asset links", () => {
  it("finds and rewrites only assets/ image links", () => {
    const md = "![a](assets/x.png) and ![b](https://cdn/x.png) and ![c](assets/y.svg)";
    expect(findAssetReferences(md)).toEqual(["x.png", "y.svg"]);
    expect(rewriteAssetLinks(md, new Map([["x.png", "/api/assets/h.png"]]))).toBe(
      "![a](/api/assets/h.png) and ![b](https://cdn/x.png) and ![c](assets/y.svg)",
    );
  });
});

describe("question snapshots", () => {
  const record: QuestionRecord = {
    subjectId: "s",
    topicId: "t",
    subtopicId: null,
    type: "SINGLE",
    text: "Q",
    code: null,
    codeLanguage: null,
    options: ["a", "b"],
    correctOptions: ["A"],
    numericAnswer: null,
    tolerance: null,
    explanation: "E",
    difficulty: "EASY",
    expectedTimeSec: 30,
    passageId: null,
    tags: [],
    source: "ORIGINAL",
    status: "PUBLISHED",
    version: 4,
    reviewNote: null,
    reviewerId: "r",
    submittedAt: new Date("2026-10-01T10:00:00Z"),
    publishedAt: new Date("2026-10-02T10:00:00Z"),
    importBatchId: "b",
  };

  it("round-trips through JSON (rollback restores exactly)", () => {
    expect(fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(record))))).toEqual(record);
  });

  it("lists changed content fields for history", () => {
    expect(changedFields(record, { ...record, text: "Q2", options: ["a", "c"] })).toEqual([
      "text",
      "options",
    ]);
  });
});

it("retries jobs with growing, capped backoff", () => {
  expect([1, 2, 3].map(backoffMs)).toEqual([2000, 4000, 8000]);
  expect(backoffMs(20)).toBe(5 * 60 * 1000);
});

it("flags companies not verified for 6 months", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  expect(isStale(new Date("2026-04-20T00:00:00Z"), now)).toBe(false);
  expect(isStale(new Date("2026-04-18T00:00:00Z"), now)).toBe(true);
});

it("makes plain excerpts from Markdown", () => {
  expect(plainExcerpt("**Bold** $x$ ![img](a.png) [link](u)", 100)).toBe("Bold x [image] link");
  expect(plainExcerpt("abcdefghij", 5)).toBe("abcd…");
});

describe("templates match the importers", () => {
  const templates = path.resolve("docs/templates");
  const files: [string, string][] = [
    ...IMPORT_DEFINITIONS.map((d): [string, string] => [d.type, d.template]),
    ...[
      "logical-reasoning",
      "verbal-ability",
      "data-interpretation",
      "operating-systems",
      "dbms",
      "computer-networks",
      "oops",
      "dsa",
      "programming-languages",
      "pseudocode",
    ].map((s): [string, string] => ["MCQ", `mcq/${s}.csv`]),
  ];

  it.each(files)("%s template %s has exactly the importer's columns", (type, file) => {
    const definition = IMPORT_DEFINITIONS.find((d) => d.type === type)!;
    const { headers } = parseCsv(readFileSync(path.join(templates, file)));
    expect([...headers].sort()).toEqual(definition.columns.map((c) => c.name).sort());
  });
});
