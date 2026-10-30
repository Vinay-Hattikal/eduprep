import "server-only";

import { unzipSync } from "fflate";
import type { Prisma } from "@/generated/prisma/client";
import type { ImportType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { storage } from "@/server/integrations/storage";
import { folderMismatches, planFolder, type PlannedFile } from "@/server/imports/folder";
import { ImportFileError, NO_ROWS_MESSAGE, parseImportFile } from "@/server/imports/parse";
import {
  commitBatch,
  confirmBatch,
  createImportBatch,
  ImportActionError,
  validateBatch,
} from "@/server/imports/pipeline";
import { getImportDefinition } from "@/server/imports/registry";
import { enqueueJob } from "@/server/jobs/queue";
import { recordAudit } from "@/server/services/audit";

// Content packs (D-061): a ZIP of a whole content folder (the layout in folder.ts), imported
// file by file in dependency order. Each file is a normal import batch, so its preview, failed
// rows and undo work as usual. Shared with `npm run content:import`, which reads a folder.

export type PackFileResult = {
  path: string;
  type: ImportType;
  outcome: "imported" | "failed" | "skipped";
  batchId?: string;
  created?: number;
  updated?: number;
  unchanged?: number;
  /** Why the file failed or was skipped, and any rejected rows. */
  problems: string[];
};

const MAX_FILES = 500;

/**
 * The ZIP's data files by path. A single top-level folder (e.g. "mock-data/") is dropped, so a
 * zipped folder and a zip of its contents both work. Mac metadata is ignored.
 */
export function readPack(data: Uint8Array): Map<string, Uint8Array> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = normalizeEntries(unzipSync(data));
  } catch {
    throw new ImportActionError("This isn't a ZIP file, or it's damaged.");
  }
  const files = Object.entries(entries).filter(
    ([name, content]) =>
      !name.endsWith("/") && !name.startsWith("__MACOSX/") && !/(^|\/)\./.test(name) && content,
  );
  const roots = new Set(files.map(([name]) => name.split("/")[0]));
  const strip =
    roots.size === 1 && files.every(([name]) => name.includes("/")) ? `${[...roots][0]}/` : "";
  return new Map(files.map(([name, content]) => [name.slice(strip.length), content]));
}

/** Windows tools write ZIP paths with backslashes; the folder plan uses forward slashes. */
function normalizeEntries(entries: Record<string, Uint8Array>): Record<string, Uint8Array> {
  return Object.fromEntries(
    Object.entries(entries).map(([name, content]) => [name.replace(/\\/g, "/"), content]),
  );
}

/** Imports one planned file: validate, then confirm and commit when any row is importable. */
export async function importPlannedFile(
  file: PlannedFile,
  data: Uint8Array,
  actorId: string,
  options: { packId?: string; publish?: boolean } = {},
): Promise<PackFileResult> {
  const fileName = file.path.split("/").at(-1)!;
  const base = { path: file.path, type: file.type };

  // Rows must match the folder they sit in; header-only files are placeholders.
  try {
    if (!getImportDefinition(file.type).parse) {
      const parsed = await parseImportFile(fileName, data, { allowZip: false });
      const mismatches = folderMismatches(file, parsed.rows);
      if (mismatches.length) return { ...base, outcome: "failed", problems: mismatches };
    }
  } catch (error) {
    if (error instanceof ImportFileError && error.message === NO_ROWS_MESSAGE)
      return { ...base, outcome: "skipped", problems: ["no rows yet"] };
    if (!(error instanceof ImportFileError)) throw error;
    // Unreadable files fall through: the pipeline records the error on the batch.
  }

  // Run each step here, in order, rather than through the queue: the next file may depend on
  // this one being committed (companies before the questions that name them).
  const batchId = await createImportBatch({
    type: file.type,
    fileName,
    data,
    actorId,
    packId: options.packId,
    queue: false,
  });
  await validateBatch(batchId);
  let batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (batch.status === "PREVIEW_READY" && batch.validRows + batch.warningRows > 0) {
    await confirmBatch(batchId, actorId, { publish: options.publish, queue: false });
    await commitBatch(batchId);
    batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  }

  const rejected = await db.importRow.findMany({
    where: { batchId, status: { in: ["ERROR", "FAILED"] } },
    orderBy: { rowNumber: "asc" },
  });
  const problems = [
    ...(batch.error ? [batch.error] : []),
    ...rejected.map((row) => {
      const messages = (row.messages as { column?: string; message: string }[])
        .map((m) => (m.column ? `${m.column}: ${m.message}` : m.message))
        .join("; ");
      return `row ${row.rowNumber}: ${messages}`;
    }),
  ];
  return {
    ...base,
    outcome: batch.status === "COMPLETED" && problems.length === 0 ? "imported" : "failed",
    batchId,
    created: batch.createdCount,
    updated: batch.updatedCount,
    unchanged: batch.unchangedCount,
    problems,
  };
}

/** Stores an uploaded pack and queues its import. Refuses ZIPs with nothing to import. */
export async function createContentPack(input: {
  fileName: string;
  data: Uint8Array;
  actorId: string;
  publish: boolean;
}): Promise<string> {
  const files = readPack(input.data);
  const { planned, unknown } = planFolder([...files.keys()]);
  if (!planned.length)
    throw new ImportActionError(
      "No content files found. Use the folder layout from the content guide (00-taxonomy, 02-mcq/<subject>, 04-companies…).",
    );
  if (planned.length > MAX_FILES)
    throw new ImportActionError(`At most ${MAX_FILES} files in one pack. Split it.`);

  const pack = await db.contentPack.create({
    data: {
      fileName: input.fileName.slice(0, 200),
      fileKey: "",
      publish: input.publish,
      unknownFiles: unknown,
      createdById: input.actorId,
    },
  });
  const fileKey = `imports/packs/${pack.id}.zip`;
  await storage.put(fileKey, input.data);
  await db.contentPack.update({ where: { id: pack.id }, data: { fileKey } });
  await recordAudit({
    actorId: input.actorId,
    action: "import.pack_upload",
    entityType: "content_pack",
    entityId: pack.id,
    after: { fileName: input.fileName, files: planned.length, publish: input.publish },
  });
  await enqueueJob("pack.import", { packId: pack.id }, { maxAttempts: 1 });
  return pack.id;
}

/** Job "pack.import": imports every file of a pack in order, saving progress after each. */
export async function runContentPack(packId: string): Promise<void> {
  const pack = await db.contentPack.findUnique({ where: { id: packId } });
  if (!pack || pack.status !== "QUEUED" || !pack.createdById) return;
  await db.contentPack.update({ where: { id: packId }, data: { status: "RUNNING" } });

  const results: PackFileResult[] = [];
  const save = (data: Prisma.ContentPackUpdateInput) =>
    db.contentPack.update({
      where: { id: packId },
      data: { results: results as unknown as Prisma.InputJsonValue, ...data },
    });
  try {
    const zip = await storage.get(pack.fileKey);
    if (!zip) throw new Error("The uploaded ZIP is missing from storage.");
    const files = readPack(zip);
    for (const file of planFolder([...files.keys()]).planned) {
      results.push(
        await importPlannedFile(file, files.get(file.path)!, pack.createdById, {
          packId,
          publish: pack.publish,
        }),
      );
      await save({});
    }
    await save({ status: "COMPLETED", completedAt: new Date() });
  } catch (error) {
    await save({
      status: "FAILED",
      completedAt: new Date(),
      error: error instanceof Error ? error.message.split("\n").pop() : "Unknown error",
    });
  }
}
