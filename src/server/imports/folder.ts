// Content folders (docs/content-workflow.md): many small files instead of one big file per type.
// The folder and file names say what each file is, so a whole folder can be imported in
// dependency order (data-import.md section 3) and checked for files in the wrong place.
//
//   00-taxonomy/*.csv                       TAXONOMY
//   01-passages/*.csv                       PASSAGES
//   02-mcq/<subject>/<topic>.csv            MCQ          every row's subject = <subject>
//   03-coding/<name>.csv                    CODING_BUNDLE (one row per problem, D-054)
//   04-companies/companies.csv              COMPANIES (profiles and sources)
//   04-companies/process.csv                COMPANY_PROCESS (rounds and sections, D-054)
//   05-tracks/*.csv                         ROLE_TRACKS
//   06-design/*.csv                         DESIGN_QUESTIONS
//
// Older multi-file layouts are still read:
//   03-coding/<set>/problems.csv, testcases.csv, solutions.csv
//   04-companies/<slug>/rounds.csv, sections.csv, sources.csv, question-map.csv
//                                           (every row's company = <slug>)
//
// Files are imported in dependency order whatever their folder number: companies before the
// questions and problems that name them. "mcq/" works as well as "02-mcq/".
// Files may also be .xlsx. Anything else (README.md, notes) is ignored.

import type { ImportType } from "@/generated/prisma/enums";
import type { ParsedRow } from "@/server/imports/parse";

export type PlannedFile = {
  type: ImportType;
  /** Relative path with forward slashes. */
  path: string;
  /** Every row must have this value in this column (the folder it sits in). */
  expect?: { column: string; value: string };
};

const ORDER: ImportType[] = [
  "TAXONOMY",
  "PASSAGES",
  "COMPANIES",
  "COMPANY_PROCESS",
  "MCQ",
  "CODING_BUNDLE",
  "CODING_PROBLEMS",
  "CODING_TESTCASES",
  "CODING_SOLUTIONS",
  "COMPANY_ROUNDS",
  "COMPANY_SECTIONS",
  "COMPANY_SOURCES",
  "COMPANY_QUESTION_MAP",
  "ROLE_TRACKS",
  "DESIGN_QUESTIONS",
];

const CODING_FILES: Record<string, ImportType> = {
  problems: "CODING_PROBLEMS",
  testcases: "CODING_TESTCASES",
  solutions: "CODING_SOLUTIONS",
};
const COMPANY_FILES: Record<string, ImportType> = {
  rounds: "COMPANY_ROUNDS",
  sections: "COMPANY_SECTIONS",
  sources: "COMPANY_SOURCES",
  "question-map": "COMPANY_QUESTION_MAP",
};
const PROCESS_FILES = new Set(["process", "company-process", "rounds-and-sections"]);
const SINGLE_TYPE_SECTIONS: Record<string, ImportType> = {
  taxonomy: "TAXONOMY",
  passages: "PASSAGES",
  tracks: "ROLE_TRACKS",
  design: "DESIGN_QUESTIONS",
};

/** What a path is, or null if it doesn't follow the layout. */
function classify(file: string): PlannedFile | null {
  const parts = file.split("/");
  const name = parts.at(-1)!;
  const stem = name.replace(/\.(csv|xlsx)$/i, "");
  const section = parts[0]!.replace(/^\d+-/, "");

  if (SINGLE_TYPE_SECTIONS[section] && parts.length === 2)
    return { type: SINGLE_TYPE_SECTIONS[section], path: file };
  if (section === "mcq" && parts.length === 3)
    return { type: "MCQ", path: file, expect: { column: "subject", value: parts[1]! } };
  if (section === "coding" && parts.length === 2) return { type: "CODING_BUNDLE", path: file };
  if (section === "coding" && parts.length === 3 && CODING_FILES[stem])
    return { type: CODING_FILES[stem], path: file };
  if (section === "companies" && parts.length === 2 && stem === "companies")
    return { type: "COMPANIES", path: file };
  if (section === "companies" && parts.length === 2 && PROCESS_FILES.has(stem))
    return { type: "COMPANY_PROCESS", path: file };
  if (section === "companies" && parts.length === 3 && COMPANY_FILES[stem])
    return {
      type: COMPANY_FILES[stem],
      path: file,
      expect: { column: "company", value: parts[1]! },
    };
  return null;
}

/**
 * Orders a folder's files for import. `files` are relative paths (either slash). Data files that
 * don't fit the layout come back in `unknown` so a misplaced file is reported, not skipped.
 */
export function planFolder(files: string[]): { planned: PlannedFile[]; unknown: string[] } {
  const planned: PlannedFile[] = [];
  const unknown: string[] = [];
  for (const raw of files) {
    const file = raw.replace(/\\/g, "/");
    if (!/\.(csv|xlsx)$/i.test(file)) continue;
    const entry = classify(file);
    if (entry) planned.push(entry);
    else unknown.push(file);
  }
  planned.sort(
    (a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.path.localeCompare(b.path),
  );
  return { planned, unknown: unknown.sort() };
}

/** Rows whose subject or company doesn't match the folder they sit in. */
export function folderMismatches(file: PlannedFile, rows: ParsedRow[]): string[] {
  const expect = file.expect;
  if (!expect) return [];
  return rows
    .filter((row) => (row.cells[expect.column] ?? "").trim() !== expect.value)
    .map(
      (row) =>
        `row ${row.rowNumber}: ${expect.column} is "${row.cells[expect.column] ?? ""}" but the file is in the "${expect.value}" folder`,
    );
}
