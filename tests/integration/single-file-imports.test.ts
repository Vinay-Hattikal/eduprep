// The single-file formats end to end (D-054), on a real database: upload, preview, commit,
// re-upload unchanged, edit, export and re-import, company tags, and "Replace all".

import { strToU8 } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { storage } from "@/server/integrations/storage";
import { exportCodingBundle } from "@/server/imports/definitions/coding-bundle";
import { exportCompanyProcess } from "@/server/imports/definitions/company-process";
import { exportCompanies } from "@/server/imports/definitions/companies";
import { exportMcq } from "@/server/imports/definitions/mcq";
import { parseCsv, toCsv } from "@/server/imports/parse";
import { rollbackBlocker } from "@/server/imports/pipeline";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let adminId: string;

/** Reads a CSV, lets the test change its rows, writes it back. */
function editCsv(
  data: Uint8Array | string,
  change: (rows: Record<string, string>[]) => Record<string, string>[],
  extraHeaders: string[] = [],
): Uint8Array {
  const { headers, rows } = parseCsv(typeof data === "string" ? strToU8(data) : data);
  return strToU8(
    toCsv(
      [...headers, ...extraHeaders.filter((h) => !headers.includes(h))],
      change(rows.map((r) => ({ ...r.cells }))),
    ),
  );
}

const rowsOf = async (batchId: string) =>
  db.importRow.findMany({ where: { batchId }, orderBy: { rowNumber: "asc" } });

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["SUPER_ADMIN"], "admin@test.example")).id;
  for (const [type, file] of [
    ["TAXONOMY", "taxonomy.csv"],
    ["PASSAGES", "passages.csv"],
  ] as const) {
    const batch = await importFile(type, file, await template(file), adminId);
    expect(batch.status).toBe("COMPLETED");
  }
});

describe("companies.csv with sources, and rounds and sections in one file", () => {
  it("imports a company with its sources, then its rounds and sections", async () => {
    const companies = await importFile(
      "COMPANIES",
      "companies.csv",
      await template("companies/companies.csv"),
      adminId,
    );
    expect(companies).toMatchObject({ status: "COMPLETED", createdCount: 1, failedCount: 0 });
    const acme = await db.company.findUniqueOrThrow({
      where: { slug: "acme-tech" },
      include: { sources: true },
    });
    expect(acme.sources.length).toBeGreaterThan(0);

    const process = await importFile(
      "COMPANY_PROCESS",
      "company-process.csv",
      await template("companies/company-process.csv"),
      adminId,
    );
    expect(process).toMatchObject({ status: "COMPLETED", createdCount: 7, failedCount: 0 });
    const rounds = await db.companyRound.findMany({
      where: { companyId: acme.id },
      orderBy: { order: "asc" },
      include: { sections: { orderBy: { order: "asc" } } },
    });
    expect(rounds.map((r) => [r.order, r.sections.length])).toEqual([
      [1, 4],
      [2, 1],
      [3, 0],
      [4, 0],
    ]);
  });

  it("re-uploading either file changes nothing", async () => {
    for (const [type, file] of [
      ["COMPANIES", "companies/companies.csv"],
      ["COMPANY_PROCESS", "companies/company-process.csv"],
    ] as const) {
      const batch = await importFile(type, file, await template(file), adminId);
      expect(batch).toMatchObject({ status: "COMPLETED", createdCount: 0, updatedCount: 0 });
    }
  });

  it("removing a section from the file removes it from the company", async () => {
    const data = editCsv(await template("companies/company-process.csv"), (rows) =>
      rows.filter((r) => r.section_name !== "Verbal Ability"),
    );
    const batch = await importFile("COMPANY_PROCESS", "process.csv", data, adminId);
    expect(batch.status).toBe("COMPLETED");
    expect(batch.updatedCount).toBeGreaterThan(0);
    expect(await db.companySection.count({ where: { name: "Verbal Ability" } })).toBe(0);
    expect(await db.companySection.count({ where: { name: "Programming Logic" } })).toBe(1);
  });

  it("exports in the upload format; re-importing the export changes nothing", async () => {
    for (const [type, csv] of [
      ["COMPANIES", await exportCompanies(db)],
      ["COMPANY_PROCESS", await exportCompanyProcess(db)],
    ] as const) {
      const batch = await importFile(type, "export.csv", strToU8(csv), adminId);
      expect(batch).toMatchObject({
        status: "COMPLETED",
        createdCount: 0,
        updatedCount: 0,
        failedCount: 0,
      });
    }
  });
});

describe("coding problems in one file", () => {
  it("imports the problem with its tests, solutions and company, then checks it in the judge", async () => {
    const data = editCsv(await template("coding/coding-problems-single-file.csv"), (rows) =>
      rows.map((r) => ({ ...r, companies: "acme-tech", asked_in: "2026-08" })),
    );
    const batch = await importFile("CODING_BUNDLE", "coding.csv", data, adminId);
    expect(batch).toMatchObject({ status: "COMPLETED", createdCount: 1, failedCount: 0 });

    const problem = await db.problem.findUniqueOrThrow({
      where: { externalId: "CODE-ARR-0001" },
      include: { testCases: true, solutions: true, companies: true },
    });
    expect(problem.status).toBe("DRAFT");
    expect(problem.testCases.filter((t) => t.isSample).length).toBeGreaterThanOrEqual(1);
    expect(problem.testCases.filter((t) => !t.isSample).length).toBeGreaterThanOrEqual(5);
    expect(problem.solutions.some((s) => s.kind === "REFERENCE")).toBe(true);
    expect(problem.companies).toMatchObject([{ askedIn: ["2026-08"] }]);
    // The judge check ran (the reference solution passed every test).
    expect(problem.validatedAt).not.toBeNull();
  });

  it("re-uploading the whole file changes nothing", async () => {
    const data = editCsv(await template("coding/coding-problems-single-file.csv"), (rows) =>
      rows.map((r) => ({ ...r, companies: "acme-tech", asked_in: "2026-08" })),
    );
    const batch = await importFile("CODING_BUNDLE", "coding.csv", data, adminId);
    expect(batch).toMatchObject({ status: "COMPLETED", unchangedCount: 1, updatedCount: 0 });
  });

  it("refuses a copy of the problem under another ID and slug", async () => {
    const data = editCsv(await template("coding/coding-problems-single-file.csv"), (rows) =>
      rows.map((r) => ({ ...r, external_id: "CODE-COPY-1", slug: "copy-of-it", companies: "" })),
    );
    const batch = await importFile("CODING_BUNDLE", "copy.csv", data, adminId, { confirm: false });
    expect(batch.errorRows).toBe(1);
    const [row] = await rowsOf(batch.id);
    expect(JSON.stringify(row!.messages)).toMatch(
      /Same statement as existing problem CODE-ARR-0001/,
    );
  });

  it("exports in the upload format; editing one test updates only that problem", async () => {
    const { csv, skipped } = await exportCodingBundle(db);
    expect(skipped).toEqual([]);
    const same = await importFile("CODING_BUNDLE", "export.csv", strToU8(csv), adminId);
    expect(same).toMatchObject({ status: "COMPLETED", unchangedCount: 1, updatedCount: 0 });

    const countTests = () =>
      db.problemTestCase.count({ where: { problem: { externalId: "CODE-ARR-0001" } } });
    const before = await countTests();
    const edited = editCsv(csv, (rows) =>
      rows.map((r) => ({ ...r, test_6_input: "2\n1 1\n2\n", test_6_output: "0 1\n" })),
    );
    const batch = await importFile("CODING_BUNDLE", "edited.csv", edited, adminId);
    expect(batch).toMatchObject({ status: "COMPLETED", updatedCount: 1 });
    // The row's tests replace the old ones: one more, not a second copy of each.
    expect(await countTests()).toBe(before + 1);
    expect(await db.problemTestCase.count({ where: { input: "2\n1 1\n2\n" } })).toBe(1);
  });
});

describe("MCQs: IDs, duplicates and company tags", () => {
  const qa = async () => template("mcq/quantitative-aptitude.csv");

  it("tags companies from the companies column", async () => {
    const data = editCsv(await qa(), (rows) =>
      rows.map((r, i) => ({ ...r, companies: i === 0 ? "acme-tech" : "" })),
    );
    const batch = await importFile("MCQ", "qa.csv", data, adminId);
    expect(batch).toMatchObject({ status: "COMPLETED", createdCount: 3 });
    const linked = await db.companyItem.findMany({ where: { questionId: { not: null } } });
    expect(linked).toHaveLength(1);
  });

  it("a tag-only change keeps the question's version and status", async () => {
    const before = await db.question.findUniqueOrThrow({ where: { externalId: "QA-AVG-0001" } });
    const data = editCsv(await qa(), (rows) => rows.map((r) => ({ ...r, companies: "acme-tech" })));
    const batch = await importFile("MCQ", "qa.csv", data, adminId);
    expect(batch).toMatchObject({ status: "COMPLETED", updatedCount: 2, unchangedCount: 1 });
    const after = await db.question.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.version).toBe(before.version);
    expect(await db.companyItem.count({ where: { questionId: { not: null } } })).toBe(3);
  });

  it("rows without IDs get stable IDs, so uploading them again changes nothing", async () => {
    const newRows = (rows: Record<string, string>[]) => [
      {
        ...rows[0]!,
        external_id: "",
        question: "What is 25% of 80?",
        option_a: "20",
        option_b: "25",
        option_c: "16",
        correct: "A",
        explanation: "80 / 4 = 20.",
        companies: "",
        asked_in: "",
      },
    ];
    const first = await importFile("MCQ", "new.csv", editCsv(await qa(), newRows), adminId);
    expect(first).toMatchObject({ status: "COMPLETED", createdCount: 1 });
    const again = await importFile("MCQ", "new.csv", editCsv(await qa(), newRows), adminId);
    expect(again).toMatchObject({ status: "COMPLETED", createdCount: 0, unchangedCount: 1 });
    expect(
      await db.question.count({ where: { externalId: { startsWith: "quantitative-aptitude-" } } }),
    ).toBe(1);
  });

  it("refuses an exact copy of a saved question under a new ID", async () => {
    const data = editCsv(await qa(), (rows) => [{ ...rows[0]!, external_id: "QA-COPY-1" }]);
    const batch = await importFile("MCQ", "copy.csv", data, adminId, { confirm: false });
    expect(batch.errorRows).toBe(1);
    const [row] = await rowsOf(batch.id);
    expect(JSON.stringify(row!.messages)).toMatch(/Same question as existing QA-PCT-0001/);
  });

  it("exports a subject with IDs filled in; re-importing it changes nothing", async () => {
    const csv = await exportMcq(db, "quantitative-aptitude");
    const batch = await importFile("MCQ", "export.csv", strToU8(csv), adminId);
    expect(batch).toMatchObject({
      status: "COMPLETED",
      createdCount: 0,
      updatedCount: 0,
      failedCount: 0,
    });
  });
});

describe("Replace all (super admin)", () => {
  it("archives problems missing from the file after saving a backup; the backup restores them", async () => {
    // A second problem, so the replace has something to archive.
    const extra = editCsv((await exportCodingBundle(db)).csv, (rows) =>
      rows.map((r) => ({
        ...r,
        external_id: "CODE-ARR-0002",
        slug: "pair-with-target-sum-two",
        title: "Pair With Target Sum II",
        statement: `${r.statement}\n\nThis time, print the indices in reverse order.`,
        companies: "",
        asked_in: "",
      })),
    );
    expect((await importFile("CODING_BUNDLE", "extra.csv", extra, adminId)).createdCount).toBe(1);

    const { csv: before } = await exportCodingBundle(db);
    const onlyFirst = editCsv(before, (rows) =>
      rows.filter((r) => r.external_id === "CODE-ARR-0001"),
    );
    const preview = await importFile("CODING_BUNDLE", "replace.csv", onlyFirst, adminId, {
      mode: "REPLACE",
      confirm: false,
    });
    expect(preview).toMatchObject({ status: "PREVIEW_READY", mode: "REPLACE", archiveCount: 1 });
    expect(preview.archivePreview[0]).toMatch(/CODE-ARR-0002/);

    const done = await importFile("CODING_BUNDLE", "replace.csv", onlyFirst, adminId, {
      mode: "REPLACE",
    });
    expect(done).toMatchObject({ status: "COMPLETED", archivedCount: 1, unchangedCount: 1 });
    expect(
      (await db.problem.findUniqueOrThrow({ where: { externalId: "CODE-ARR-0002" } })).status,
    ).toBe("ARCHIVED");
    expect(await rollbackBlocker(done.id)).toMatch(/backup/);

    // The backup has both problems; importing it brings the archived one back as a draft.
    const backup = await storage.get(done.backupKey!);
    expect(
      parseCsv(backup!)
        .rows.map((r) => r.cells.external_id)
        .sort(),
    ).toEqual(["CODE-ARR-0001", "CODE-ARR-0002"]);
    const restore = await importFile("CODING_BUNDLE", "backup.csv", backup!, adminId);
    expect(restore).toMatchObject({ status: "COMPLETED", updatedCount: 1, unchangedCount: 1 });
    expect(
      (await db.problem.findUniqueOrThrow({ where: { externalId: "CODE-ARR-0002" } })).status,
    ).toBe("DRAFT");
  });

  it("a subject replace archives only that subject's questions", async () => {
    // A question in another subject must not be touched.
    await importFile("MCQ", "lr.csv", await template("mcq/logical-reasoning.csv"), adminId);
    const lrBefore = await db.question.count({
      where: { subject: { slug: "logical-reasoning" }, status: { not: "ARCHIVED" } },
    });

    const data = editCsv(await template("mcq/quantitative-aptitude.csv"), (rows) =>
      rows.slice(0, 1),
    );
    const batch = await importFile("MCQ", "qa-replace.csv", data, adminId, { mode: "REPLACE" });
    expect(batch.status).toBe("COMPLETED");
    expect(batch.archivedCount).toBeGreaterThanOrEqual(3);
    expect(
      await db.question.count({
        where: { subject: { slug: "quantitative-aptitude" }, status: { not: "ARCHIVED" } },
      }),
    ).toBe(1);
    expect(
      await db.question.count({
        where: { subject: { slug: "logical-reasoning" }, status: { not: "ARCHIVED" } },
      }),
    ).toBe(lrBefore);
  });
});
