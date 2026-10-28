import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ImportMode, ImportType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { confirmBatch, createImportBatch } from "@/server/imports/pipeline";
import { drainJobs } from "@/server/jobs/runner";

/** Empties every table (keeps migrations). Tests start from a known state. */
export async function resetDatabase() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await db.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  }
}

export async function createUser(
  roles: ("SUPER_ADMIN" | "CONTENT_AUTHOR" | "REVIEWER")[],
  email: string,
) {
  return db.user.create({ data: { name: email.split("@")[0]!, email, roles } });
}

export async function template(file: string): Promise<Buffer> {
  return readFile(path.resolve("docs/templates", file));
}

/** Uploads, validates, confirms and commits a file, running jobs inline. Returns the batch. */
export async function importFile(
  type: ImportType,
  fileName: string,
  data: Uint8Array,
  actorId: string,
  { confirm = true, mode = "ADD_UPDATE" as ImportMode } = {},
) {
  const batchId = await createImportBatch({ type, fileName, data, actorId, mode });
  await drainJobs();
  let batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (confirm && batch.status === "PREVIEW_READY") {
    await confirmBatch(batchId, actorId);
    await drainJobs();
    batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  }
  return batch;
}
