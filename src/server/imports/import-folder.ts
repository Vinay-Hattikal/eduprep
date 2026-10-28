// Imports a whole content folder (layout in folder.ts) through the normal pipeline: one batch per
// file, in dependency order, each validated and committed as drafts, every step audited.
// Used by `npm run content:import` and the mock-data integration test.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";
import { folderMismatches, planFolder, type PlannedFile } from "@/server/imports/folder";
import { ImportFileError, NO_ROWS_MESSAGE, parseImportFile } from "@/server/imports/parse";
import { confirmBatch, createImportBatch } from "@/server/imports/pipeline";
import { getImportDefinition } from "@/server/imports/registry";
import { drainJobs } from "@/server/jobs/runner";

export type FolderFileResult = {
  file: PlannedFile;
  outcome: "imported" | "failed" | "skipped";
  batchId?: string;
  created?: number;
  updated?: number;
  unchanged?: number;
  /** Why the file failed or was skipped, and any rejected rows. */
  problems: string[];
};

export type FolderResult = { files: FolderFileResult[]; unknown: string[] };

async function listFiles(root: string, dir = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(root, relative)));
    else files.push(relative);
  }
  return files;
}

async function importOne(
  root: string,
  file: PlannedFile,
  actorId: string,
): Promise<FolderFileResult> {
  const data = await readFile(path.join(root, file.path));
  const fileName = path.basename(file.path);

  // Header-only files are placeholders (e.g. a company with no mapped questions yet).
  try {
    const definition = getImportDefinition(file.type);
    if (!definition.parse) {
      const parsed = await parseImportFile(fileName, data, { allowZip: false });
      const mismatches = folderMismatches(file, parsed.rows);
      if (mismatches.length) return { file, outcome: "failed", problems: mismatches };
    }
  } catch (error) {
    if (error instanceof ImportFileError && error.message === NO_ROWS_MESSAGE)
      return { file, outcome: "skipped", problems: ["no rows yet"] };
    if (!(error instanceof ImportFileError)) throw error;
    // Unreadable files fall through: the pipeline records the error on the batch.
  }

  const batchId = await createImportBatch({ type: file.type, fileName, data, actorId });
  await drainJobs();
  let batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (batch.status === "PREVIEW_READY" && batch.validRows + batch.warningRows > 0) {
    await confirmBatch(batchId, actorId);
    await drainJobs();
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
    file,
    outcome: batch.status === "COMPLETED" && problems.length === 0 ? "imported" : "failed",
    batchId,
    created: batch.createdCount,
    updated: batch.updatedCount,
    unchanged: batch.unchangedCount,
    problems,
  };
}

/** Imports every file under `root`. Files that don't fit the layout are reported, not imported. */
export async function importFolder(
  root: string,
  actorId: string,
  onFile?: (result: FolderFileResult) => void,
): Promise<FolderResult> {
  const { planned, unknown } = planFolder(await listFiles(root));
  const files: FolderFileResult[] = [];
  for (const file of planned) {
    const result = await importOne(root, file, actorId);
    files.push(result);
    onFile?.(result);
  }
  // Coding imports queue judge checks.
  await drainJobs();
  return { files, unknown };
}
