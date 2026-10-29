// Content packs (D-061): a ZIP of the mock-data folder imports like the folder itself.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  createContentPack,
  readPack,
  runContentPack,
  type PackFileResult,
} from "@/server/imports/content-pack";
import { ImportActionError } from "@/server/imports/pipeline";
import { drainJobs } from "@/server/jobs/runner";
import { createUser, resetDatabase } from "./helpers";

let adminId: string;

/** The mock-data folder as a ZIP, inside a top-level "mock-data/" folder like a zipped folder. */
async function zipFolder(root: string) {
  const files: Record<string, Uint8Array> = {};
  async function walk(dir: string) {
    for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(relative);
      else
        files[`mock-data/${relative}`] = new Uint8Array(await readFile(path.join(root, relative)));
    }
  }
  await walk("");
  files["mock-data/stray/notes.csv"] = strToU8("a,b\n1,2\n");
  files["__MACOSX/mock-data/._x"] = strToU8("junk");
  return zipSync(files);
}

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["ADMIN"], "admin@test.example")).id;
});

describe("content packs", () => {
  it("reads a zipped folder whether or not it has a top-level folder", () => {
    const files = readPack(
      zipSync({ "pack/00-taxonomy/taxonomy.csv": strToU8("x"), "pack/README.md": strToU8("y") }),
    );
    expect([...files.keys()].sort()).toEqual(["00-taxonomy/taxonomy.csv", "README.md"]);
    expect(() => readPack(strToU8("not a zip"))).toThrow(ImportActionError);
  });

  it("refuses a ZIP with nothing to import", async () => {
    await expect(
      createContentPack({
        fileName: "empty.zip",
        data: zipSync({ "notes.txt": strToU8("hi") }),
        actorId: adminId,
        publish: false,
      }),
    ).rejects.toThrow(/No content files/);
  });

  it("imports every file in order, links each batch, and reports stray files", async () => {
    const packId = await createContentPack({
      fileName: "mock-data.zip",
      data: await zipFolder(path.resolve("mock-data")),
      actorId: adminId,
      publish: false,
    });
    await runContentPack(packId);
    await drainJobs(); // judge checks queued by the coding import

    const pack = await db.contentPack.findUniqueOrThrow({ where: { id: packId } });
    expect(pack.status).toBe("COMPLETED");
    expect(pack.unknownFiles).toEqual(["stray/notes.csv"]);
    const results = pack.results as unknown as PackFileResult[];
    expect(
      results.filter((r) => r.outcome !== "imported").map((r) => [r.path, r.problems]),
    ).toEqual([]);
    expect(results[0]!.type).toBe("TAXONOMY");
    expect(await db.importBatch.count({ where: { packId } })).toBe(results.length);
    expect(await db.question.count({ where: { status: "DRAFT" } })).toBe(66);
    expect(await db.company.count()).toBe(3);

    // Running the job again does nothing: it only picks up waiting packs.
    await runContentPack(packId);
    expect(await db.importBatch.count({ where: { packId } })).toBe(results.length);
  });
});
