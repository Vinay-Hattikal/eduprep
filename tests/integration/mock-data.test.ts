// The mock-data/ folder is the format reference for content writers: every file must import
// cleanly through the folder importer.

import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { importFolder } from "@/server/imports/import-folder";
import { createUser, resetDatabase } from "./helpers";

describe("mock-data folder", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("imports every file as drafts, and again with nothing changed", async () => {
    const admin = await createUser(["ADMIN"], "admin@example.com");
    const root = path.resolve("mock-data");

    const first = await importFolder(root, admin.id);
    expect(first.unknown).toEqual([]);
    const notImported = first.files.filter((f) => f.outcome !== "imported");
    expect(notImported.map((f) => [f.file.path, f.problems])).toEqual([]);

    expect(await db.question.count({ where: { status: "DRAFT" } })).toBe(66);
    expect(await db.problem.count()).toBe(2);
    expect(await db.company.count()).toBe(3);
    expect(await db.companyRound.count()).toBe(8);
    expect(await db.companySource.count()).toBeGreaterThanOrEqual(3);
    // Company tags come from the `companies` column of the question and coding files.
    expect(await db.companyItem.count()).toBe(9);

    const second = await importFolder(root, admin.id);
    const changed = second.files.filter((f) => (f.created ?? 0) + (f.updated ?? 0) > 0);
    expect(changed.map((f) => f.file.path)).toEqual([]);
  });
});
