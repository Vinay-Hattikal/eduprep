// Coding problems in one file (D-054): one row per problem with its statement, reference
// solution, starter code, sample and hidden tests, and the companies that ask it. The row is the
// full truth for its problem: tests and solutions not in the row are replaced.
//
// Problems with very large tests or many tests still use the ZIP package (coding.ts).

import type { ContentStatus, SolutionKind } from "@/generated/prisma/enums";
import { CODING_LANGUAGE_IDS, isCodingLanguage } from "@/lib/coding/languages";
import { normalizeQuestionText } from "@/lib/content/question-rules";
import { CellReader } from "@/server/imports/cells";
import {
  COMPANY_LINK_COLUMNS,
  hasCompanyColumn,
  linksChanged,
  loadCompanySlugs,
  readCompanyLinks,
  warnUnlinked,
  writeCompanyLinks,
  type CompanyLinks,
  type ExistingLink,
} from "@/server/imports/company-links";
import {
  loadProblemContext,
  MIN_HIDDEN_TESTS,
  MIN_SAMPLE_TESTS,
  PROBLEM_COLUMNS,
  readProblemRow,
  validationJobs,
  writeProblem,
  type ProblemContext,
  type ProblemValue,
} from "@/server/imports/definitions/coding";
import { todayUtc } from "@/server/imports/definitions/companies";
import { toCsv, type ParsedFile, type ParsedRow } from "@/server/imports/parse";
import {
  finishRow,
  sameValues,
  type ColumnSpec,
  type CommitOutcome,
  type DbReader,
  type ImportDefinition,
  type ValidatedRow,
} from "@/server/imports/types";

export const BUNDLE_SAMPLES = 3;
export const BUNDLE_TESTS = 20;
/** Excel silently cuts longer cells, so a cell of exactly this length was probably cut. */
export const EXCEL_CELL_LIMIT = 32_767;
const MAX_TEST_BYTES = 1024 * 1024;
const MAX_CODE_BYTES = 64 * 1024;
const MAX_ID_LENGTH = 64;

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export const BUNDLE_COLUMNS: ColumnSpec[] = [
  { name: "external_id", required: false },
  ...PROBLEM_COLUMNS.filter((c) => c.name !== "external_id"),
  { name: "solution_language", required: true },
  { name: "solution_code", required: true },
  { name: "brute_language", required: false },
  { name: "brute_code", required: false },
  ...CODING_LANGUAGE_IDS.map((language) => ({ name: `starter_${language}`, required: false })),
  ...range(BUNDLE_SAMPLES).flatMap((i) =>
    ["input", "output", "explanation"].map((part) => ({
      name: `sample_${i}_${part}`,
      required: false,
    })),
  ),
  ...range(BUNDLE_TESTS).flatMap((i) =>
    ["input", "output"].map((part) => ({ name: `test_${i}_${part}`, required: false })),
  ),
  ...COMPANY_LINK_COLUMNS,
];

export type BundleTest = {
  order: number;
  isSample: boolean;
  input: string;
  output: string;
  explanation: string | null;
};
export type BundleSolution = { kind: SolutionKind; language: string; code: string };

export type BundleValue = {
  problem: ProblemValue;
  tests: BundleTest[];
  solutions: BundleSolution[];
  links: CompanyLinks;
  /** False when only the company links changed: the problem itself isn't touched. */
  contentChanged: boolean;
};

type ExistingContent = {
  status: ContentStatus;
  tests: BundleTest[];
  solutions: BundleSolution[];
  links: ExistingLink[];
};

export type BundleContext = ProblemContext & {
  content: Map<string, ExistingContent>;
  /** Normalized statement → externalId, for problems that aren't archived. */
  statements: Map<string, string>;
  companies: Map<string, { id: string }>;
  companyColumn: boolean;
  today: Date;
};

/** The row's ID: the external_id cell, else the ID of the problem with this slug, else the slug. */
export function bundleExternalId(cells: Record<string, string>, slugs: Map<string, string>) {
  const explicit = cells.external_id?.trim();
  if (explicit) return explicit;
  const slug = cells.slug?.trim() ?? "";
  return slugs.get(slug) ?? slug;
}

const text = (value: string | undefined) => (value ?? "").replace(/\r\n/g, "\n");

function sortSolutions(solutions: BundleSolution[]) {
  return [...solutions].sort((a, b) =>
    `${a.kind}/${a.language}`.localeCompare(`${b.kind}/${b.language}`),
  );
}

function readTests(r: CellReader, cells: Record<string, string>): BundleTest[] {
  const tests: BundleTest[] = [];
  const read = (prefix: string, isSample: boolean) => {
    const input = text(cells[`${prefix}_input`]);
    const output = text(cells[`${prefix}_output`]);
    const explanation = isSample
      ? (r.markdown(`${prefix}_explanation`, { required: false }) ?? null)
      : null;
    if (!input.trim() && !output.trim()) {
      if (explanation) r.error(`${prefix}_output`, "This test has an explanation but no output.");
      return;
    }
    if (!output.trim()) r.error(`${prefix}_output`, "Required when the input is filled.");
    for (const [part, value] of [
      ["input", input],
      ["output", output],
    ] as const) {
      if (value.length > MAX_TEST_BYTES)
        r.error(`${prefix}_${part}`, "Over 1 MB: use a ZIP problem package for this problem.");
      else if (value.length === EXCEL_CELL_LIMIT)
        r.warn(
          `${prefix}_${part}`,
          "Exactly 32,767 characters: Excel cuts cells at this length, so this test may be incomplete. Use a ZIP package for large tests.",
        );
    }
    tests.push({ order: tests.length + 1, isSample, input, output, explanation });
  };
  for (const i of range(BUNDLE_SAMPLES)) read(`sample_${i}`, true);
  for (const i of range(BUNDLE_TESTS)) read(`test_${i}`, false);

  const samples = tests.filter((t) => t.isSample).length;
  const hidden = tests.length - samples;
  if (samples < MIN_SAMPLE_TESTS)
    r.error("sample_1_output", `Add at least ${MIN_SAMPLE_TESTS} sample test.`);
  if (hidden < MIN_HIDDEN_TESTS)
    r.error(
      "test_1_output",
      `Add at least ${MIN_HIDDEN_TESTS} hidden tests (found ${hidden}). Fill test_1 … test_${MIN_HIDDEN_TESTS}.`,
    );
  return tests;
}

function readSolutions(r: CellReader, cells: Record<string, string>, languages: string[]) {
  const solutions: BundleSolution[] = [];
  const read = (
    kind: SolutionKind,
    languageColumn: string,
    codeColumn: string,
    required: boolean,
  ) => {
    const language = r.optional(languageColumn)?.toLowerCase();
    const code = text(cells[codeColumn]);
    if (!language && !code.trim()) {
      if (required) r.error(codeColumn, "Required: the reference solution.");
      return;
    }
    if (!language) return r.error(languageColumn, "Required when there is code.");
    if (!isCodingLanguage(language))
      return r.error(
        languageColumn,
        `"${language}" isn't supported. Use ${CODING_LANGUAGE_IDS.join(", ")}.`,
      );
    if (!code.trim()) return r.error(codeColumn, "Required.");
    if (code.length > MAX_CODE_BYTES) return r.error(codeColumn, "Code over 64 KB.");
    if (language === "java" && !/public\s+class\s+Main\b/.test(code))
      return r.error(codeColumn, "Java code must declare public class Main.");
    solutions.push({ kind, language, code });
  };
  read("REFERENCE", "solution_language", "solution_code", true);
  read("BRUTE", "brute_language", "brute_code", false);
  for (const language of CODING_LANGUAGE_IDS) {
    const column = `starter_${language}`;
    const code = text(cells[column]);
    if (!code.trim()) continue;
    if (languages.length && !languages.includes(language)) {
      r.error(column, `This problem doesn't allow ${language}. Add it to languages or clear this.`);
      continue;
    }
    if (code.length > MAX_CODE_BYTES) {
      r.error(column, "Code over 64 KB.");
      continue;
    }
    if (language === "java" && !/public\s+class\s+Main\b/.test(code)) {
      r.error(column, "Java code must declare public class Main.");
      continue;
    }
    solutions.push({ kind: "STARTER", language, code });
  }
  return sortSolutions(solutions);
}

/** Validates one row. Pure, so the rules are unit-tested without a database. */
export function readBundleRow(
  row: ParsedRow,
  ctx: BundleContext,
  seen: { ids: Map<string, number>; statements: Map<string, number> },
): ValidatedRow<BundleValue> {
  const r = new CellReader(row.cells);
  const explicit = row.cells.external_id?.trim();
  const externalId = bundleExternalId(row.cells, ctx.slugs);
  const idTooLong = !explicit && externalId.length > MAX_ID_LENGTH;
  if (idTooLong)
    r.error("external_id", "Add an external_id: the slug is too long to use as the ID.");

  const base = readProblemRow(
    { rowNumber: row.rowNumber, cells: { ...row.cells, external_id: externalId } },
    ctx,
    seen.ids,
  );
  const languages = r.list("languages").map((l) => l.toLowerCase());
  const tests = readTests(r, row.cells);
  const solutions = readSolutions(r, row.cells, languages);
  const links = readCompanyLinks(r, ctx.companyColumn, ctx.companies, ctx.today);

  // Exact duplicates: the same statement under another ID.
  const statement = row.cells.statement ? normalizeQuestionText(row.cells.statement) : "";
  if (statement) {
    const other = ctx.statements.get(statement);
    const firstRow = seen.statements.get(statement);
    if (other && other !== externalId)
      r.error("statement", `Same statement as existing problem ${other}. This is a duplicate.`);
    else if (firstRow) r.error("statement", `Same statement as row ${firstRow}.`);
    else seen.statements.set(statement, row.rowNumber);
  }

  const messages = [
    // An over-long slug also fails readProblemRow's ID check; our message says what to do.
    ...base.messages.filter((m) => !(idTooLong && m.column === "external_id")),
    ...r.messages,
  ];
  if (!base.value || r.hasErrors) return finishRow<BundleValue>(row, messages, undefined, null);

  const existing = ctx.content.get(externalId);
  const contentChanged =
    !existing ||
    base.action !== "UNCHANGED" ||
    existing.status === "ARCHIVED" ||
    !sameValues(existing.tests, tests) ||
    !sameValues(sortSolutions(existing.solutions), solutions);
  const linksDiffer = linksChanged(links, existing?.links ?? []);
  const unlinked = new CellReader({});
  warnUnlinked(unlinked, links, existing?.links ?? [], ctx.companies);
  messages.push(...unlinked.messages);

  if (existing && contentChanged) {
    const extra = new CellReader({});
    if (existing.status === "ARCHIVED")
      extra.warn(undefined, "This problem is archived. Importing brings it back as a draft.");
    const removed = existing.solutions.filter(
      (s) => !solutions.some((n) => n.kind === s.kind && n.language === s.language),
    );
    if (removed.length)
      extra.warn(
        undefined,
        `Removes code not in this row: ${removed.map((s) => `${s.kind.toLowerCase()} (${s.language})`).join(", ")}.`,
      );
    const oldSamples = existing.tests.filter((t) => t.isSample).length;
    const oldHidden = existing.tests.length - oldSamples;
    if (oldSamples > BUNDLE_SAMPLES || oldHidden > BUNDLE_TESTS)
      extra.warn(
        undefined,
        `This problem has ${existing.tests.length} tests now; this row replaces them with ${tests.length}. It was probably imported as a ZIP package.`,
      );
    messages.push(...extra.messages);
  }

  const value: BundleValue = { problem: base.value, tests, solutions, links, contentChanged };
  const action = !existing ? "CREATE" : contentChanged || linksDiffer ? "UPDATE" : "UNCHANGED";
  return finishRow(row, messages, value, action, base.existingId);
}

async function loadBundleContext(
  db: DbReader,
  rows: ParsedRow[],
  headers: readonly string[],
): Promise<BundleContext> {
  const all = await db.problem.findMany({
    select: { externalId: true, slug: true, statement: true, status: true },
  });
  const slugs = new Map(all.map((p) => [p.slug, p.externalId]));
  const ids = rows.map((row) => bundleExternalId(row.cells, slugs));
  const [base, content, companies] = await Promise.all([
    loadProblemContext(db, ids),
    db.problem.findMany({
      where: { externalId: { in: ids } },
      select: {
        externalId: true,
        status: true,
        testCases: { orderBy: { order: "asc" } },
        solutions: true,
        companies: { select: { companyId: true, askedIn: true } },
      },
    }),
    loadCompanySlugs(db),
  ]);
  return {
    ...base,
    content: new Map(
      content.map((p) => [
        p.externalId,
        {
          status: p.status,
          tests: p.testCases.map(({ order, isSample, input, output, explanation }) => ({
            order,
            isSample,
            input,
            output,
            explanation,
          })),
          solutions: p.solutions.map(({ kind, language, code }) => ({ kind, language, code })),
          links: p.companies.filter((l) => l.companyId),
        },
      ]),
    ),
    statements: new Map(
      all
        .filter((p) => p.status !== "ARCHIVED")
        .map((p) => [normalizeQuestionText(p.statement), p.externalId]),
    ),
    companies,
    companyColumn: hasCompanyColumn(headers),
    today: todayUtc(),
  };
}

// ---------- export (also the backup before a replace) ----------

const lower = (value: string) => value.toLowerCase();
const SOURCE_CELLS = { ORIGINAL: "original", MEMORY_BASED: "memory-based" } as const;

/**
 * Every problem that isn't archived, in the single-file format, so admins can edit and re-upload
 * instead of keeping their own copies. Problems that don't fit the columns (more than 3 samples
 * or 20 hidden tests, several reference solutions, tests Excel would cut) are left out: they're
 * managed with ZIP packages.
 */
export async function exportCodingBundle(
  db: DbReader,
): Promise<{ csv: string; skipped: string[] }> {
  const problems = await db.problem.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { externalId: "asc" },
    include: {
      topics: { select: { slug: true } },
      testCases: { orderBy: { order: "asc" } },
      solutions: true,
      companies: { include: { company: { select: { slug: true } } } },
    },
  });
  const rows: Record<string, string>[] = [];
  const skipped: string[] = [];
  for (const p of problems) {
    const samples = p.testCases.filter((t) => t.isSample);
    const hidden = p.testCases.filter((t) => !t.isSample);
    const references = p.solutions.filter((s) => s.kind === "REFERENCE");
    const brutes = p.solutions.filter((s) => s.kind === "BRUTE");
    const tooLong = p.testCases.some(
      (t) => t.input.length >= EXCEL_CELL_LIMIT || t.output.length >= EXCEL_CELL_LIMIT,
    );
    if (
      samples.length > BUNDLE_SAMPLES ||
      hidden.length > BUNDLE_TESTS ||
      references.length !== 1 ||
      brutes.length > 1 ||
      tooLong
    ) {
      skipped.push(p.externalId);
      continue;
    }
    const askedIn = [...new Set(p.companies.flatMap((c) => c.askedIn))].sort().reverse();
    const row: Record<string, string> = {
      external_id: p.externalId,
      title: p.title,
      slug: p.slug,
      difficulty: lower(p.difficulty),
      topics: p.topics.map((t) => t.slug).join("|"),
      statement: p.statement,
      input_format: p.inputFormat,
      output_format: p.outputFormat,
      constraints: p.constraints,
      time_limit_ms: String(p.timeLimitMs),
      memory_limit_mb: String(p.memoryLimitMb),
      languages: p.languages.join("|"),
      scoring: lower(p.scoring),
      checker: p.checker,
      source: SOURCE_CELLS[p.source],
      hint_1: p.hints[0] ?? "",
      hint_2: p.hints[1] ?? "",
      hint_3: p.hints[2] ?? "",
      editorial: p.editorial ?? "",
      solution_language: references[0]!.language,
      solution_code: references[0]!.code,
      brute_language: brutes[0]?.language ?? "",
      brute_code: brutes[0]?.code ?? "",
      companies: p.companies.map((c) => c.company.slug).join("|"),
      // Only when every company has the same months, so a re-import changes nothing.
      asked_in: p.companies.every((c) => c.askedIn.join() === p.companies[0]!.askedIn.join())
        ? askedIn.join("|")
        : "",
    };
    for (const s of p.solutions.filter((s) => s.kind === "STARTER"))
      row[`starter_${s.language}`] = s.code;
    samples.forEach((t, i) => {
      row[`sample_${i + 1}_input`] = t.input;
      row[`sample_${i + 1}_output`] = t.output;
      row[`sample_${i + 1}_explanation`] = t.explanation ?? "";
    });
    hidden.forEach((t, i) => {
      row[`test_${i + 1}_input`] = t.input;
      row[`test_${i + 1}_output`] = t.output;
    });
    rows.push(row);
  }
  return {
    csv: toCsv(
      BUNDLE_COLUMNS.map((c) => c.name),
      rows,
    ),
    skipped,
  };
}

// ---------- definition ----------

export const codingBundleImport: ImportDefinition<BundleValue> = {
  type: "CODING_BUNDLE",
  label: "Coding problems (single file)",
  description:
    "One row per problem: statement, reference solution, starter code, samples, hidden tests and companies. Re-upload the whole file any time: only changed problems are updated.",
  permission: "content.edit",
  template: "coding/coding-problems-single-file.csv",
  allowZip: false,
  columns: BUNDLE_COLUMNS,
  commitChunkSize: 1,

  async validate(rows, file: ParsedFile, db) {
    const ctx = await loadBundleContext(db, rows, file.headers);
    const seen = { ids: new Map<string, number>(), statements: new Map<string, number>() };
    return rows.map((row) => readBundleRow(row, ctx, seen));
  },

  async commit(rows, { tx, actorId, batchId }) {
    const outcomes: CommitOutcome[] = [];
    for (const row of rows) {
      const value = row.value!;
      let problemId = row.existingId;
      if (value.contentChanged || !problemId) {
        const problem = await writeProblem(tx, value.problem, actorId, batchId);
        problemId = problem.id;
        await tx.problemTestCase.deleteMany({ where: { problemId } });
        await tx.problemTestCase.createMany({
          data: value.tests.map((t) => ({ ...t, problemId: problemId! })),
        });
        await tx.problemSolution.deleteMany({
          where: {
            problemId,
            NOT: { OR: value.solutions.map((s) => ({ kind: s.kind, language: s.language })) },
          },
        });
        for (const s of value.solutions) {
          await tx.problemSolution.upsert({
            where: { problemId_kind_language: { problemId, kind: s.kind, language: s.language } },
            create: { problemId, ...s },
            update: { code: s.code },
          });
        }
      }
      await writeCompanyLinks(tx, { problemId }, value.links);
      outcomes.push({ rowNumber: row.rowNumber, entityId: problemId, action: row.action! });
    }
    return outcomes;
  },

  followUpJobs: validationJobs,

  replace: {
    scope: () => "every coding problem",
    async missing(file, db) {
      const all = await db.problem.findMany({
        select: { id: true, externalId: true, slug: true, title: true, status: true },
        orderBy: { externalId: "asc" },
      });
      const slugs = new Map(all.map((p) => [p.slug, p.externalId]));
      const inFile = new Set(file.rows.map((row) => bundleExternalId(row.cells, slugs)));
      return all
        .filter((p) => p.status !== "ARCHIVED" && !inFile.has(p.externalId))
        .map((p) => ({ id: p.id, label: `${p.externalId} · ${p.title}` }));
    },
    async archive(ids, tx) {
      await tx.problem.updateMany({ where: { id: { in: ids } }, data: { status: "ARCHIVED" } });
    },
    async backup(_file, db) {
      return { fileName: "coding-problems-backup.csv", csv: (await exportCodingBundle(db)).csv };
    },
  },
};
