import { describe, expect, it } from "vitest";
import { folderMismatches, planFolder } from "@/server/imports/folder";

describe("content folders", () => {
  it("orders files by dependency, whatever order they are listed in", () => {
    const { planned, unknown } = planFolder([
      "06-design/design-questions.csv",
      "04-companies/globex/question-map.csv",
      "04-companies/globex/sections.csv",
      "04-companies/globex/rounds.csv",
      "04-companies/companies.csv",
      "03-coding/core/solutions.csv",
      "03-coding/core/testcases.csv",
      "03-coding/core/problems.csv",
      "02-mcq\\dbms\\sql.csv",
      "01-passages/passages.csv",
      "00-taxonomy/taxonomy.csv",
      "README.md",
      "05-tracks/role-tracks.xlsx",
    ]);
    expect(unknown).toEqual([]);
    // Companies first: question and coding files may name them in a `companies` column.
    expect(planned.map((f) => f.type)).toEqual([
      "TAXONOMY",
      "PASSAGES",
      "COMPANIES",
      "MCQ",
      "CODING_PROBLEMS",
      "CODING_TESTCASES",
      "CODING_SOLUTIONS",
      "COMPANY_ROUNDS",
      "COMPANY_SECTIONS",
      "COMPANY_QUESTION_MAP",
      "ROLE_TRACKS",
      "DESIGN_QUESTIONS",
    ]);
    expect(planned[3]).toEqual({
      type: "MCQ",
      path: "02-mcq/dbms/sql.csv",
      expect: { column: "subject", value: "dbms" },
    });
  });

  it("reads the single-file layout: one coding file, companies plus process (D-054)", () => {
    const { planned, unknown } = planFolder([
      "03-coding/core-problems.csv",
      "04-companies/process.csv",
      "02-mcq/dbms/sql.csv",
      "04-companies/companies.csv",
      "00-taxonomy/taxonomy.csv",
    ]);
    expect(unknown).toEqual([]);
    expect(planned.map((f) => f.type)).toEqual([
      "TAXONOMY",
      "COMPANIES",
      "COMPANY_PROCESS",
      "MCQ",
      "CODING_BUNDLE",
    ]);
  });

  it("reports files outside the layout instead of skipping them", () => {
    expect(
      planFolder(["mcq/dbms.csv", "03-coding/core/tests.csv", "companies/acme/rounds.csv"]).unknown,
    ).toEqual(["03-coding/core/tests.csv", "mcq/dbms.csv"]);
  });

  it("finds rows filed under the wrong subject or company", () => {
    const file = {
      type: "COMPANY_ROUNDS" as const,
      path: "04-companies/globex/rounds.csv",
      expect: { column: "company", value: "globex" },
    };
    expect(
      folderMismatches(file, [
        { rowNumber: 2, cells: { company: "globex" } },
        { rowNumber: 3, cells: { company: "initech" } },
      ]),
    ).toEqual(['row 3: company is "initech" but the file is in the "globex" folder']);
  });
});
