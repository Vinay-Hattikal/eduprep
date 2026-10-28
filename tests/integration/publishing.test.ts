// One admin role, no review step (D-056): "Publish after import" and publishing a coding
// problem once it passes the judge check.

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { drainJobs } from "@/server/jobs/runner";
import { requestValidation } from "@/server/services/problems";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let adminId: string;

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["ADMIN"], "admin@test.example")).id;
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), adminId);
  await importFile(
    "COMPANIES",
    "companies/companies.csv",
    await template("companies/companies.csv"),
    adminId,
  );
});

describe("publish after import", () => {
  it("leaves imported questions as drafts unless asked", async () => {
    const batch = await importFile(
      "MCQ",
      "mcq/logical-reasoning.csv",
      await template("mcq/logical-reasoning.csv"),
      adminId,
    );
    expect(batch).toMatchObject({
      status: "COMPLETED",
      publishAfterImport: false,
      publishedCount: 0,
    });
    expect(await db.question.count({ where: { status: "PUBLISHED" } })).toBe(0);
  });

  it("publishes questions that pass the checks when asked", async () => {
    const batch = await importFile(
      "MCQ",
      "mcq/quantitative-aptitude.csv",
      await template("mcq/quantitative-aptitude.csv"),
      adminId,
      { publish: true },
    );
    expect(batch.status).toBe("COMPLETED");
    const imported = batch.createdCount + batch.updatedCount + batch.unchangedCount;
    expect(batch.publishedCount).toBeGreaterThan(0);
    expect(batch.publishedCount).toBeLessThanOrEqual(imported);
    const live = await db.question.count({
      where: { importBatchId: batch.id, status: "PUBLISHED" },
    });
    expect(live).toBe(batch.publishedCount);
    const audit = await db.auditLog.count({
      where: { action: "question.publish", actorId: adminId },
    });
    expect(audit).toBe(batch.publishedCount);
  });

  it("publishes design questions", async () => {
    const batch = await importFile(
      "DESIGN_QUESTIONS",
      "design/design-questions.csv",
      await template("design/design-questions.csv"),
      adminId,
      { publish: true },
    );
    expect(batch.publishedCount).toBe(batch.createdCount);
    expect(await db.designQuestion.count({ where: { status: "DRAFT" } })).toBe(0);
  });

  it("publishes coding problems once they pass the judge check", async () => {
    const batch = await importFile(
      "CODING_BUNDLE",
      "coding/coding-problems-single-file.csv",
      await template("coding/coding-problems-single-file.csv"),
      adminId,
      { publish: true },
    );
    expect(batch.status).toBe("COMPLETED");
    await drainJobs();
    const problems = await db.problem.findMany({ select: { status: true, validatedAt: true } });
    expect(problems.length).toBeGreaterThan(0);
    for (const p of problems) expect(p.status).toBe(p.validatedAt ? "PUBLISHED" : "DRAFT");
    expect(problems.some((p) => p.status === "PUBLISHED")).toBe(true);
  });
});

describe("check and publish", () => {
  it("keeps a problem that fails the judge check as a draft", async () => {
    const problem = await db.problem.findFirstOrThrow();
    await db.problem.update({
      where: { id: problem.id },
      data: { status: "DRAFT", validatedAt: null },
    });
    await db.problemSolution.updateMany({
      where: { problemId: problem.id, kind: "REFERENCE" },
      data: { code: 'print("wrong")', language: "python" },
    });
    await requestValidation(problem.id, adminId);
    await drainJobs();
    const after = await db.problem.findUniqueOrThrow({ where: { id: problem.id } });
    expect(after.status).toBe("DRAFT");
    expect(after.validatedAt).toBeNull();
  });
});
