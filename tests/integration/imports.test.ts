import { strToU8, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { storage } from "@/server/integrations/storage";
import { failedRowsCsv, rollbackBatch, rollbackBlocker } from "@/server/imports/pipeline";
import { transitionQuestion } from "@/server/services/questions";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let adminId: string;
const admin = () => ({ id: adminId, roles: ["ADMIN" as const] });

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["ADMIN"], "admin@test.example")).id;
  const taxonomy = await importFile(
    "TAXONOMY",
    "taxonomy.csv",
    await template("taxonomy.csv"),
    adminId,
  );
  expect(taxonomy.status).toBe("COMPLETED");
  await importFile("PASSAGES", "passages.csv", await template("passages.csv"), adminId);
  // The question templates tag the example company (D-054), so it comes first.
  await importFile(
    "COMPANIES",
    "companies.csv",
    await template("companies/companies.csv"),
    adminId,
  );
});

describe("MCQ import", () => {
  it("imports a subject file as drafts with a first version", async () => {
    const batch = await importFile(
      "MCQ",
      "qa.csv",
      await template("mcq/quantitative-aptitude.csv"),
      adminId,
    );
    expect(batch).toMatchObject({ status: "COMPLETED", createdCount: 3, failedCount: 0 });

    const question = await db.question.findUniqueOrThrow({ where: { externalId: "QA-PCT-0001" } });
    expect(question).toMatchObject({
      status: "DRAFT",
      version: 1,
      correctOptions: ["B"],
      importBatchId: batch.id,
    });
    expect(await db.contentVersion.count({ where: { entityId: question.id } })).toBe(1);
  });

  it("is idempotent: importing the same file again changes nothing", async () => {
    const before = await db.question.count();
    const batch = await importFile(
      "MCQ",
      "qa.csv",
      await template("mcq/quantitative-aptitude.csv"),
      adminId,
    );
    expect(batch).toMatchObject({
      status: "COMPLETED",
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 3,
    });
    expect(await db.question.count()).toBe(before);
  });

  it("updates changed rows, sends published questions back to draft, and can be undone", async () => {
    const original = await db.question.findUniqueOrThrow({ where: { externalId: "QA-PCT-0001" } });
    await transitionQuestion(original.id, "publish", admin());
    const published = await db.question.findUniqueOrThrow({ where: { id: original.id } });
    expect(published.status).toBe("PUBLISHED");

    const csv = (await template("mcq/quantitative-aptitude.csv"))
      .toString("utf8")
      .replace(",easy,45,", ",medium,45,")
      .concat(
        'QA-NEW-0001,quantitative-aptitude,percentages,,single,"New question?",,,Yes,No,,,,A,,"Because it is new and correct.",easy,30,,,original\n',
      );
    const batch = await importFile("MCQ", "qa-v2.csv", strToU8(csv), adminId);
    expect(batch).toMatchObject({
      status: "COMPLETED",
      createdCount: 1,
      updatedCount: 1,
      unchangedCount: 2,
    });

    const updated = await db.question.findUniqueOrThrow({ where: { id: original.id } });
    expect(updated).toMatchObject({
      difficulty: "MEDIUM",
      status: "DRAFT",
      version: published.version + 1,
    });

    expect(await rollbackBlocker(batch.id)).toBeNull();
    await rollbackBatch(batch.id, adminId);

    const restored = await db.question.findUniqueOrThrow({ where: { id: original.id } });
    expect(restored).toMatchObject({
      difficulty: "EASY",
      status: "PUBLISHED",
      version: published.version,
    });
    expect(await db.question.findUnique({ where: { externalId: "QA-NEW-0001" } })).toBeNull();
    expect((await db.importBatch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe(
      "ROLLED_BACK",
    );
  });

  it("refuses to undo an import once its questions have moved on", async () => {
    const csv =
      (await template("mcq/quantitative-aptitude.csv")).toString("utf8") +
      'QA-NEW-0002,quantitative-aptitude,percentages,,single,"Another?",,,Yes,No,,,,A,,"Because it is correct, clearly.",easy,30,,,original\n';
    const batch = await importFile("MCQ", "qa-v3.csv", strToU8(csv), adminId);
    const created = await db.question.findUniqueOrThrow({ where: { externalId: "QA-NEW-0002" } });
    await transitionQuestion(created.id, "publish", admin());

    expect(await rollbackBlocker(batch.id)).toMatch(/QA-NEW-0002 has changed/);
    await expect(rollbackBatch(batch.id, adminId)).rejects.toThrow(/changed/);
  });

  it("previews row errors, skips them, and offers them as a CSV", async () => {
    const csv =
      (await template("mcq/logical-reasoning.csv")).toString("utf8") +
      'LR-BAD-0001,logical-reasoning,blood-relations,,single,"Broken?",,,Same,same,,,,C,,"Explanation that is long enough.",easy,30,,,original\n';
    const preview = await importFile("MCQ", "lr.csv", strToU8(csv), adminId, { confirm: false });
    expect(preview).toMatchObject({ status: "PREVIEW_READY", totalRows: 4, errorRows: 1 });

    const errors = await failedRowsCsv(preview.id);
    expect(errors).toMatch(/LR-BAD-0001/);
    expect(errors).toMatch(/Two options are the same/);
    expect(errors!.split("\n")[0]).toMatch(/,error\r?$/);
  });

  it("warns about near-duplicate questions using trigram similarity", async () => {
    const csv =
      "external_id,subject,topic,subtopic,type,question,code,code_language,option_a,option_b,option_c,option_d,option_e,correct,tolerance,explanation,difficulty,expected_time_sec,passage_id,tags,source\n" +
      'QA-DUP-0001,quantitative-aptitude,time-work,,single,"A can finish a piece of work in 10 days and B can finish it in 15 days. In how many days can they finish it working together?",,,5,6,8,12,,B,,"Together they do 1/10 + 1/15 = 1/6 per day.",easy,50,,,original\n';
    const preview = await importFile("MCQ", "dup.csv", strToU8(csv), adminId, { confirm: false });
    const row = await db.importRow.findFirstOrThrow({ where: { batchId: preview.id } });
    expect(row.status).toBe("WARNING");
    expect(JSON.stringify(row.messages)).toMatch(/Very similar to existing question QA-TW-0001/);
  });

  it("stores ZIP images by content hash and rewrites links", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const csv =
      "external_id,subject,topic,subtopic,type,question,code,code_language,option_a,option_b,option_c,option_d,option_e,correct,tolerance,explanation,difficulty,expected_time_sec,passage_id,tags,source\n" +
      'DI-IMG-0001,data-interpretation,di-pie-charts,,numeric,"What share is blue? ![pie](assets/pie.png)",,,,,,,,25,0,"Blue covers a quarter of the chart: 25%.",easy,40,,,original\n';
    const zip = zipSync({ "questions.csv": strToU8(csv), "assets/pie.png": png });
    const batch = await importFile("MCQ", "di.zip", zip, adminId);
    expect(batch.status).toBe("COMPLETED");

    const question = await db.question.findUniqueOrThrow({ where: { externalId: "DI-IMG-0001" } });
    const stored = /\/api\/assets\/([a-f0-9]{64}\.png)/.exec(question.text)?.[1];
    expect(stored).toBeDefined();
    expect(new Uint8Array((await storage.get(`assets/${stored}`))!)).toEqual(png);
  });

  it("fails the whole file when columns are missing or misspelled", async () => {
    const batch = await importFile(
      "MCQ",
      "bad.csv",
      strToU8("external_id,qestion\nX,Y\n"),
      adminId,
    );
    expect(batch.status).toBe("FAILED");
    expect(batch.error).toMatch(/Missing columns: .*subject/);
    expect(batch.error).toMatch(/Unknown columns: qestion/);
  });
});

describe("company imports", () => {
  it("imports companies, rounds, sections, sources and the question map", async () => {
    for (const subject of ["logical-reasoning", "pseudocode"]) {
      await importFile("MCQ", `${subject}.csv`, await template(`mcq/${subject}.csv`), adminId);
    }
    for (const [type, file] of [
      ["COMPANIES", "companies/companies.csv"],
      ["COMPANY_ROUNDS", "companies/company-rounds.csv"],
      ["COMPANY_SECTIONS", "companies/company-sections.csv"],
      ["COMPANY_SOURCES", "companies/company-sources.csv"],
    ] as const) {
      const batch = await importFile(type, file, await template(file), adminId);
      expect(batch, file).toMatchObject({ status: "COMPLETED", failedCount: 0, errorRows: 0 });
    }
    const map = await importFile(
      "COMPANY_QUESTION_MAP",
      "map.csv",
      await template("companies/company-question-map.csv"),
      adminId,
    );
    // The question files already tagged acme-tech; the map adds rounds and report counts.
    expect(map).toMatchObject({ status: "COMPLETED", errorRows: 1 });
    expect(map.createdCount + map.updatedCount).toBe(3);

    const company = await db.company.findUniqueOrThrow({
      where: { slug: "acme-tech" },
      include: {
        rounds: { include: { sections: { include: { topics: true } } } },
        items: true,
        sources: true,
      },
    });
    expect(company.status).toBe("DRAFT");
    expect(company.rounds).toHaveLength(4);
    expect(company.rounds.find((r) => r.order === 1)?.sections).toHaveLength(4);
    expect(company.sources).toHaveLength(2);
    expect(company.items).toHaveLength(3);
  });
});
