// Coding problem imports (data-import.md 4.4): problems, test cases, solutions, or one ZIP
// package. A problem is checked in the judge after import (all reference solutions must pass
// every test) before it can be published (D-034).

import { unzipSync } from "fflate";
import type { Difficulty, ScoringMode, SolutionKind } from "@/generated/prisma/enums";
import { isValidChecker } from "@/lib/coding/checker";
import { CODING_LANGUAGE_IDS, isCodingLanguage, type CodingLanguage } from "@/lib/coding/languages";
import { CellReader } from "@/server/imports/cells";
import { ImportFileError, parseCsv, type ParsedFile, type ParsedRow } from "@/server/imports/parse";
import {
  finishRow,
  sameValues,
  type CommitOutcome,
  type DbReader,
  type ImportDefinition,
  type ValidatedRow,
} from "@/server/imports/types";
import type { JobRequest } from "@/server/jobs/queue";

export const MIN_SAMPLE_TESTS = 1;
export const MIN_HIDDEN_TESTS = 5;
const MAX_TEST_BYTES = 1024 * 1024;
const MAX_CODE_BYTES = 64 * 1024;

const DIFFICULTIES: Record<string, Difficulty> = { easy: "EASY", medium: "MEDIUM", hard: "HARD" };
const SCORING: Record<string, ScoringMode> = {
  all_or_nothing: "ALL_OR_NOTHING",
  per_test: "PER_TEST",
};
const SOURCES = { original: "ORIGINAL", "memory-based": "MEMORY_BASED" } as const;
const KINDS: Record<string, SolutionKind> = {
  reference: "REFERENCE",
  brute: "BRUTE",
  starter: "STARTER",
};

/** Each problem whose tests, solutions or limits changed is checked in the judge again. */
export function validationJobs(outcomes: CommitOutcome[]): JobRequest[] {
  return [...new Set(outcomes.map((o) => o.entityId))].map((problemId) => ({
    type: "problem.validate",
    payload: { problemId },
  }));
}

// ---------- problems ----------

export type ProblemValue = {
  externalId: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  topicIds: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  languages: string[];
  scoring: ScoringMode;
  checker: string;
  hints: string[];
  editorial: string | null;
  source: "ORIGINAL" | "MEMORY_BASED";
};

export const PROBLEM_COLUMNS = [
  ...[
    "external_id",
    "title",
    "slug",
    "difficulty",
    "topics",
    "statement",
    "input_format",
    "output_format",
    "constraints",
    "time_limit_ms",
    "memory_limit_mb",
    "languages",
    "scoring",
    "checker",
    "source",
  ].map((name) => ({ name, required: true })),
  ...["hint_1", "hint_2", "hint_3", "editorial"].map((name) => ({ name, required: false })),
];

export type ProblemContext = {
  /** DSA topics by slug. */
  topics: Map<string, { id: string }>;
  existing: Map<string, ProblemValue & { id: string }>;
  /** slug → externalId of the problem using it. */
  slugs: Map<string, string>;
};

export function readProblemRow(
  row: ParsedRow,
  ctx: ProblemContext,
  seen: Map<string, number>,
): ValidatedRow<ProblemValue> {
  const r = new CellReader(row.cells);
  const externalId = r.externalId("external_id");
  if (externalId) {
    const first = seen.get(externalId);
    if (first) r.error("external_id", `Same ID as row ${first}.`);
    else seen.set(externalId, row.rowNumber);
  }
  const title = r.required("title");
  const slug = r.slug("slug");
  if (slug && externalId) {
    const owner = ctx.slugs.get(slug);
    if (owner && owner !== externalId) r.error("slug", `"${slug}" is already used by ${owner}.`);
  }
  const difficulty = r.choice("difficulty", DIFFICULTIES);

  const topicIds: string[] = [];
  const topicSlugs = r.list("topics");
  if (!topicSlugs.length) r.error("topics", "List at least one DSA topic slug.");
  for (const topicSlug of topicSlugs) {
    const topic = ctx.topics.get(topicSlug);
    if (!topic) r.error("topics", `"${topicSlug}" isn't a topic in the dsa subject.`);
    else if (!topicIds.includes(topic.id)) topicIds.push(topic.id);
  }

  const statement = r.markdown("statement");
  const inputFormat = r.markdown("input_format");
  const outputFormat = r.markdown("output_format");
  const constraints = r.markdown("constraints");
  const timeLimitMs = r.int("time_limit_ms", { min: 200, max: 10_000 });
  const memoryLimitMb = r.int("memory_limit_mb", { min: 32, max: 1024 });

  const languages: CodingLanguage[] = [];
  for (const language of r.list("languages")) {
    if (!isCodingLanguage(language))
      r.error("languages", `"${language}" isn't supported. Use ${CODING_LANGUAGE_IDS.join(", ")}.`);
    else if (!languages.includes(language)) languages.push(language);
  }
  if (!languages.length && !r.messages.some((m) => m.column === "languages"))
    r.error("languages", "List at least one language.");

  const scoring = r.choice("scoring", SCORING);
  const checker = r.required("checker");
  if (checker && !isValidChecker(checker))
    r.error("checker", `"${checker}" isn't valid. Use exact, ignore_whitespace or float:1e-6.`);
  const hints = ["hint_1", "hint_2", "hint_3"]
    .map((c) => r.markdown(c, { required: false }))
    .filter((h): h is string => Boolean(h));
  const editorial = r.markdown("editorial", { required: false }) ?? null;
  const source = r.choice("source", SOURCES);

  if (
    r.hasErrors ||
    !externalId ||
    !title ||
    !slug ||
    !difficulty ||
    !statement ||
    !inputFormat ||
    !outputFormat ||
    !constraints ||
    !timeLimitMs ||
    !memoryLimitMb ||
    !scoring ||
    !checker ||
    !source
  ) {
    return finishRow<ProblemValue>(row, r.messages, undefined, null);
  }
  const value: ProblemValue = {
    externalId,
    slug,
    title,
    difficulty,
    topicIds: topicIds.sort(),
    statement,
    inputFormat,
    outputFormat,
    constraints,
    timeLimitMs,
    memoryLimitMb,
    languages,
    scoring,
    checker,
    hints,
    editorial,
    source,
  };
  const existing = ctx.existing.get(externalId);
  const action = !existing
    ? "CREATE"
    : sameValues({ ...existing, id: undefined }, value)
      ? "UNCHANGED"
      : "UPDATE";
  return finishRow(row, r.messages, value, action, existing?.id);
}

export async function loadProblemContext(
  db: DbReader,
  externalIds: string[],
): Promise<ProblemContext> {
  const [topics, existing, slugs] = await Promise.all([
    db.topic.findMany({ where: { subject: { slug: "dsa" } }, select: { id: true, slug: true } }),
    db.problem.findMany({
      where: { externalId: { in: externalIds } },
      include: { topics: { select: { id: true } } },
    }),
    db.problem.findMany({ select: { slug: true, externalId: true } }),
  ]);
  return {
    topics: new Map(topics.map((t) => [t.slug, { id: t.id }])),
    existing: new Map(
      existing.map((p) => [
        p.externalId,
        {
          id: p.id,
          externalId: p.externalId,
          slug: p.slug,
          title: p.title,
          difficulty: p.difficulty,
          topicIds: p.topics.map((t) => t.id).sort(),
          statement: p.statement,
          inputFormat: p.inputFormat,
          outputFormat: p.outputFormat,
          constraints: p.constraints,
          timeLimitMs: p.timeLimitMs,
          memoryLimitMb: p.memoryLimitMb,
          languages: p.languages,
          scoring: p.scoring,
          checker: p.checker,
          hints: p.hints,
          editorial: p.editorial,
          source: p.source,
        },
      ]),
    ),
    slugs: new Map(slugs.map((p) => [p.slug, p.externalId])),
  };
}

export type Tx = Parameters<ImportDefinition<unknown>["commit"]>[1]["tx"];

export async function writeProblem(
  tx: Tx,
  value: ProblemValue,
  actorId: string | null,
  batchId: string,
) {
  const { topicIds, ...data } = value;
  const before = await tx.problem.findUnique({ where: { externalId: value.externalId } });
  const topics = topicIds.map((id) => ({ id }));
  if (!before) {
    return tx.problem.create({
      data: {
        ...data,
        status: "DRAFT",
        authorId: actorId,
        importBatchId: batchId,
        topics: { connect: topics },
      },
    });
  }
  // Imports never publish; a changed problem goes back to draft and is re-checked (D-010, D-034).
  return tx.problem.update({
    where: { id: before.id },
    data: {
      ...data,
      status: "DRAFT",
      version: before.version + 1,
      importBatchId: batchId,
      validatedAt: null,
      validationNote: null,
      publishedAt: null,
      topics: { set: topics },
    },
  });
}

export const codingProblemImport: ImportDefinition<ProblemValue> = {
  type: "CODING_PROBLEMS",
  label: "Coding problems",
  description: "Problem statements and settings. Then import test cases and solutions.",
  permission: "content.edit",
  template: "coding/coding-problems.csv",
  allowZip: false,
  legacy: true,
  columns: PROBLEM_COLUMNS,
  async validate(rows, _file, db) {
    const ctx = await loadProblemContext(
      db,
      rows.map((r) => r.cells.external_id?.trim() ?? ""),
    );
    const seen = new Map<string, number>();
    return rows.map((row) => readProblemRow(row, ctx, seen));
  },
  async commit(rows, { tx, actorId, batchId }) {
    const outcomes: CommitOutcome[] = [];
    for (const row of rows) {
      const problem = await writeProblem(tx, row.value!, actorId, batchId);
      outcomes.push({ rowNumber: row.rowNumber, entityId: problem.id, action: row.action! });
    }
    return outcomes;
  },
  followUpJobs: validationJobs,
};

// ---------- test cases ----------

export type TestCaseValue = {
  problemId: string;
  order: number;
  isSample: boolean;
  input: string;
  output: string;
  explanation: string | null;
};

export type TestCaseContext = {
  problems: Map<string, { id: string }>;
  /** Existing tests per problem id, in order. */
  existing: Map<string, Omit<TestCaseValue, "problemId">[]>;
};

/** Cells keep test data exactly as written, except Windows line endings. */
const testText = (value: string | undefined) => (value ?? "").replace(/\r\n/g, "\n");

export function validateTestCaseRows(
  rows: ParsedRow[],
  ctx: TestCaseContext,
): ValidatedRow<TestCaseValue>[] {
  const results = rows.map((row) => {
    const r = new CellReader(row.cells);
    const externalId = r.required("problem_id");
    const problem = externalId ? ctx.problems.get(externalId) : undefined;
    if (externalId && !problem)
      r.error("problem_id", `No problem "${externalId}". Import coding-problems.csv first.`);
    const order = r.int("order", { min: 1, max: 1000 });
    const isSample = r.yesNo("is_sample", { required: true });
    const input = testText(row.cells.input);
    const output = testText(row.cells.output);
    if (!output.trim()) r.error("output", "Required.");
    if (input.length > MAX_TEST_BYTES || output.length > MAX_TEST_BYTES) {
      r.error(undefined, "Test data over 1 MB: use a ZIP problem package instead.");
    }
    const explanation = r.markdown("explanation", { required: false }) ?? null;
    if (r.hasErrors || !problem || !order || isSample === undefined)
      return { row, r, value: undefined as TestCaseValue | undefined };
    return {
      row,
      r,
      value: { problemId: problem.id, order, isSample, input, output, explanation },
    };
  });

  // Per-problem rules: unique order, enough sample and hidden tests.
  const byProblem = new Map<string, typeof results>();
  for (const result of results) {
    if (!result.value) continue;
    const list = byProblem.get(result.value.problemId) ?? [];
    list.push(result);
    byProblem.set(result.value.problemId, list);
  }
  const actions = new Map<string, "CREATE" | "UPDATE" | "UNCHANGED">();
  for (const [problemId, list] of byProblem) {
    const orders = new Set<number>();
    for (const result of list) {
      if (orders.has(result.value!.order))
        result.r.error("order", `Order ${result.value!.order} is used twice for this problem.`);
      orders.add(result.value!.order);
    }
    const samples = list.filter((t) => t.value!.isSample).length;
    const hidden = list.length - samples;
    if (samples < MIN_SAMPLE_TESTS || hidden < MIN_HIDDEN_TESTS) {
      for (const result of list) {
        result.r.error(
          undefined,
          `Each problem needs at least ${MIN_SAMPLE_TESTS} sample and ${MIN_HIDDEN_TESTS} hidden tests (found ${samples} and ${hidden}).`,
        );
      }
    }
    const incoming = list
      .map((t) => ({ ...t.value!, problemId: undefined }))
      .sort((a, b) => a.order - b.order);
    const current = ctx.existing.get(problemId) ?? [];
    actions.set(
      problemId,
      current.length === 0 ? "CREATE" : sameValues(current, incoming) ? "UNCHANGED" : "UPDATE",
    );
  }

  return results.map(({ row, r, value }) =>
    finishRow(
      row,
      r.messages,
      r.hasErrors ? undefined : value,
      value ? (actions.get(value.problemId) ?? null) : null,
    ),
  );
}

export const codingTestCaseImport: ImportDefinition<TestCaseValue> = {
  type: "CODING_TESTCASES",
  label: "Coding test cases",
  description: "Sample and hidden tests. A file replaces all tests of every problem it mentions.",
  permission: "content.edit",
  template: "coding/coding-testcases.csv",
  allowZip: false,
  legacy: true,
  columns: [
    { name: "problem_id", required: true },
    { name: "order", required: true },
    { name: "is_sample", required: true },
    { name: "input", required: true },
    { name: "output", required: true },
    { name: "explanation", required: false },
  ],
  commitChunkSize: Number.MAX_SAFE_INTEGER, // a problem's tests are replaced together
  async validate(rows, _file, db) {
    const ids = [...new Set(rows.map((r) => r.cells.problem_id?.trim() ?? ""))];
    const problems = await db.problem.findMany({
      where: { externalId: { in: ids } },
      select: { id: true, externalId: true, testCases: { orderBy: { order: "asc" } } },
    });
    return validateTestCaseRows(rows, {
      problems: new Map(problems.map((p) => [p.externalId, { id: p.id }])),
      existing: new Map(
        problems.map((p) => [
          p.id,
          p.testCases.map(({ order, isSample, input, output, explanation }) => ({
            order,
            isSample,
            input,
            output,
            explanation,
          })),
        ]),
      ),
    });
  },
  async commit(rows, { tx }) {
    const problemIds = [...new Set(rows.map((r) => r.value!.problemId))];
    await tx.problemTestCase.deleteMany({ where: { problemId: { in: problemIds } } });
    await tx.problemTestCase.createMany({ data: rows.map((r) => r.value!) });
    await tx.problem.updateMany({
      where: { id: { in: problemIds } },
      data: { validatedAt: null, validationNote: null },
    });
    return rows.map((row) => ({
      rowNumber: row.rowNumber,
      entityId: row.value!.problemId,
      action: row.action!,
    }));
  },
  followUpJobs: validationJobs,
};

// ---------- solutions ----------

export type SolutionValue = {
  problemId: string;
  kind: SolutionKind;
  language: string;
  code: string;
};

export type SolutionContext = {
  problems: Map<string, { id: string; languages: string[] }>;
  existing: Map<string, string>; // `${problemId}/${kind}/${language}` → code
};

export function validateSolutionRows(
  rows: ParsedRow[],
  ctx: SolutionContext,
): ValidatedRow<SolutionValue>[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const r = new CellReader(row.cells);
    const externalId = r.required("problem_id");
    const problem = externalId ? ctx.problems.get(externalId) : undefined;
    if (externalId && !problem)
      r.error("problem_id", `No problem "${externalId}". Import coding-problems.csv first.`);
    const kind = r.choice("kind", KINDS);
    const language = r.required("language")?.toLowerCase();
    if (language && !isCodingLanguage(language))
      r.error("language", `"${language}" isn't supported.`);
    else if (
      language &&
      problem &&
      kind !== "REFERENCE" &&
      kind !== "BRUTE" &&
      !problem.languages.includes(language)
    ) {
      r.error("language", `This problem doesn't allow ${language}.`);
    }
    const code = (row.cells.code ?? "").replace(/\r\n/g, "\n");
    if (!code.trim()) r.error("code", "Required.");
    if (code.length > MAX_CODE_BYTES) r.error("code", "Code over 64 KB.");
    if (language === "java" && code && !/public\s+class\s+Main\b/.test(code))
      r.error("code", "Java code must declare public class Main.");
    if (problem && kind && language) {
      const key = `${problem.id}/${kind}/${language}`;
      const first = seen.get(key);
      if (first) r.error("language", `Same problem, kind and language as row ${first}.`);
      else seen.set(key, row.rowNumber);
    }
    if (r.hasErrors || !problem || !kind || !language)
      return finishRow<SolutionValue>(row, r.messages, undefined, null);
    const existing = ctx.existing.get(`${problem.id}/${kind}/${language}`);
    const action = existing === undefined ? "CREATE" : existing === code ? "UNCHANGED" : "UPDATE";
    return finishRow(row, r.messages, { problemId: problem.id, kind, language, code }, action);
  });
}

export const codingSolutionImport: ImportDefinition<SolutionValue> = {
  type: "CODING_SOLUTIONS",
  label: "Coding solutions",
  description: "Reference, brute-force and starter code. Reference solutions must pass every test.",
  permission: "content.edit",
  template: "coding/coding-solutions.csv",
  allowZip: false,
  legacy: true,
  columns: [
    { name: "problem_id", required: true },
    { name: "kind", required: true },
    { name: "language", required: true },
    { name: "code", required: true },
  ],
  async validate(rows, _file, db) {
    const ids = [...new Set(rows.map((r) => r.cells.problem_id?.trim() ?? ""))];
    const problems = await db.problem.findMany({
      where: { externalId: { in: ids } },
      select: { id: true, externalId: true, languages: true, solutions: true },
    });
    return validateSolutionRows(rows, {
      problems: new Map(problems.map((p) => [p.externalId, { id: p.id, languages: p.languages }])),
      existing: new Map(
        problems.flatMap((p) =>
          p.solutions.map((s) => [`${p.id}/${s.kind}/${s.language}`, s.code] as const),
        ),
      ),
    });
  },
  async commit(rows, { tx }) {
    const outcomes: CommitOutcome[] = [];
    for (const row of rows) {
      const { problemId, kind, language, code } = row.value!;
      await tx.problemSolution.upsert({
        where: { problemId_kind_language: { problemId, kind, language } },
        create: { problemId, kind, language, code },
        update: { code },
      });
      if (kind !== "STARTER")
        await tx.problem.update({
          where: { id: problemId },
          data: { validatedAt: null, validationNote: null },
        });
      outcomes.push({ rowNumber: row.rowNumber, entityId: problemId, action: row.action! });
    }
    return outcomes;
  },
  followUpJobs: validationJobs,
};

// ---------- ZIP problem package ----------

const EXTENSIONS: Record<string, CodingLanguage> = {
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  java: "java",
  py: "python",
  js: "javascript",
};

type PackageContent = {
  tests: { order: number; isSample: boolean; input: string; output: string }[];
  solutions: { kind: SolutionKind; language: string; code: string }[];
};

export type PackageValue = { problem: ProblemValue; content: PackageContent };

const PACKAGE_CONTENT = new WeakMap<ParsedFile, Map<string, PackageContent>>();

/** Reads a ZIP with one folder per problem (data-import.md 4.4, "Large tests"). */
export async function parseProblemPackage(fileName: string, data: Uint8Array): Promise<ParsedFile> {
  if (!fileName.toLowerCase().endsWith(".zip"))
    throw new ImportFileError("Upload the problem package as a .zip file.");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch {
    throw new ImportFileError("The ZIP file couldn't be opened.");
  }
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes).replace(/\r\n/g, "\n");
  const folders = new Map<string, Record<string, Uint8Array>>();
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith("/") || name.startsWith("__MACOSX/")) continue;
    const [folder, ...rest] = name.split("/");
    if (!rest.length) continue;
    const files = folders.get(folder!) ?? {};
    files[rest.join("/")] = bytes;
    folders.set(folder!, files);
  }
  if (folders.size === 0) throw new ImportFileError("The ZIP must contain one folder per problem.");

  const rows: ParsedRow[] = [];
  const content = new Map<string, PackageContent>();
  let rowNumber = 1;
  for (const [folder, files] of folders) {
    rowNumber += 1;
    const csv = files["problem.csv"];
    if (!csv) throw new ImportFileError(`${folder}/ has no problem.csv.`);
    const table = parseCsv(csv);
    if (table.rows.length !== 1)
      throw new ImportFileError(`${folder}/problem.csv must have exactly one row.`);
    const missing = PROBLEM_COLUMNS.filter(
      (c) => c.required && !table.headers.includes(c.name),
    ).map((c) => c.name);
    const unknown = table.headers.filter((h) => !PROBLEM_COLUMNS.some((c) => c.name === h));
    if (missing.length || unknown.length) {
      throw new ImportFileError(
        `${folder}/problem.csv: ${[missing.length && `missing columns ${missing.join(", ")}`, unknown.length && `unknown columns ${unknown.join(", ")}`].filter(Boolean).join("; ")}.`,
      );
    }

    const tests: PackageContent["tests"] = [];
    for (const [name, bytes] of Object.entries(files)) {
      const match = /^tests\/(sample-)?(\d+)\.in$/.exec(name);
      if (!match) continue;
      const out = files[name.replace(/\.in$/, ".out")];
      if (!out) throw new ImportFileError(`${folder}/${name} has no matching .out file.`);
      tests.push({ order: 0, isSample: Boolean(match[1]), input: text(bytes), output: text(out) });
    }
    tests
      .sort((a, b) => Number(b.isSample) - Number(a.isSample))
      .forEach((t, i) => (t.order = i + 1));

    const solutions: PackageContent["solutions"] = [];
    for (const [name, bytes] of Object.entries(files)) {
      const match = /^(solutions\/(reference|brute)|starter\/[^/]+)\.(\w+)$/.exec(name);
      if (!match) continue;
      const language = EXTENSIONS[match[3]!.toLowerCase()];
      if (!language) continue;
      const kind: SolutionKind =
        match[2] === "reference" ? "REFERENCE" : match[2] === "brute" ? "BRUTE" : "STARTER";
      solutions.push({ kind, language, code: text(bytes) });
    }

    content.set(String(rowNumber), { tests, solutions });
    rows.push({
      rowNumber,
      cells: {
        ...table.rows[0]!.cells,
        folder,
        tests: `${tests.filter((t) => t.isSample).length} sample, ${tests.filter((t) => !t.isSample).length} hidden`,
        solutions: solutions.map((s) => `${s.kind.toLowerCase()}:${s.language}`).join(", "),
      },
    });
  }
  const parsed: ParsedFile = { headers: [], rows, assets: new Map() };
  PACKAGE_CONTENT.set(parsed, content);
  return parsed;
}

export const codingPackageImport: ImportDefinition<PackageValue> = {
  type: "CODING_PACKAGE",
  label: "Coding problem package (ZIP)",
  description:
    "One folder per problem: problem.csv, tests/*.in/.out, solutions/, starter/. For large tests.",
  permission: "content.edit",
  template: "coding/coding-problems.csv",
  allowZip: true,
  // The columns of each folder's problem.csv (checked by parseProblemPackage).
  columns: PROBLEM_COLUMNS,
  parse: parseProblemPackage,
  commitChunkSize: 1,
  async validate(rows, file, db) {
    const ctx = await loadProblemContext(
      db,
      rows.map((r) => r.cells.external_id?.trim() ?? ""),
    );
    const seen = new Map<string, number>();
    const content = PACKAGE_CONTENT.get(file)!;
    return rows.map((row) => {
      const result = readProblemRow(row, ctx, seen);
      const pkg = content.get(String(row.rowNumber))!;
      const extra = new CellReader({});
      const samples = pkg.tests.filter((t) => t.isSample).length;
      const hidden = pkg.tests.length - samples;
      if (samples < MIN_SAMPLE_TESTS || hidden < MIN_HIDDEN_TESTS) {
        extra.error(
          "tests",
          `Needs at least ${MIN_SAMPLE_TESTS} sample and ${MIN_HIDDEN_TESTS} hidden tests (found ${samples} and ${hidden}).`,
        );
      }
      if (!pkg.solutions.some((s) => s.kind === "REFERENCE"))
        extra.error("solutions", "Add solutions/reference.<ext>.");
      for (const s of pkg.solutions) {
        if (s.language === "java" && !/public\s+class\s+Main\b/.test(s.code))
          extra.error("solutions", "Java code must declare public class Main.");
      }
      const messages = [...result.messages, ...extra.messages];
      const value = result.value ? { problem: result.value, content: pkg } : undefined;
      // Package rows always rewrite tests and solutions, so treat them as updates.
      return finishRow(
        row,
        messages,
        value,
        result.action === "UNCHANGED" ? "UPDATE" : result.action,
        result.existingId,
      );
    });
  },
  async commit(rows, { tx, actorId, batchId }) {
    const outcomes: CommitOutcome[] = [];
    for (const row of rows) {
      const { problem: value, content } = row.value!;
      const problem = await writeProblem(tx, value, actorId, batchId);
      await tx.problemTestCase.deleteMany({ where: { problemId: problem.id } });
      await tx.problemTestCase.createMany({
        data: content.tests.map((t) => ({ ...t, problemId: problem.id })),
      });
      for (const s of content.solutions) {
        await tx.problemSolution.upsert({
          where: {
            problemId_kind_language: { problemId: problem.id, kind: s.kind, language: s.language },
          },
          create: { problemId: problem.id, ...s },
          update: { code: s.code },
        });
      }
      await tx.problem.update({
        where: { id: problem.id },
        data: { validatedAt: null, validationNote: null },
      });
      outcomes.push({ rowNumber: row.rowNumber, entityId: problem.id, action: row.action! });
    }
    return outcomes;
  },
  followUpJobs: validationJobs,
};
