// Imports a whole content folder (layout in folder.ts) through the normal pipeline: one batch per
// file, in dependency order, each validated and committed as drafts, every step audited.
// Used by `npm run content:import` and the mock-data integration test. The admin panel's ZIP
// upload (content-pack.ts) does the same with the files of a ZIP.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { importPlannedFile, type PackFileResult } from "@/server/imports/content-pack";
import { planFolder } from "@/server/imports/folder";
import { drainJobs } from "@/server/jobs/runner";

export type FolderResult = { files: PackFileResult[]; unknown: string[] };

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

/** Imports every file under `root`. Files that don't fit the layout are reported, not imported. */
export async function importFolder(
  root: string,
  actorId: string,
  onFile?: (result: PackFileResult) => void,
): Promise<FolderResult> {
  const { planned, unknown } = planFolder(await listFiles(root));
  const files: PackFileResult[] = [];
  for (const file of planned) {
    const result = await importPlannedFile(
      file,
      await readFile(path.join(root, file.path)),
      actorId,
    );
    files.push(result);
    onFile?.(result);
  }
  // Coding imports queue judge checks.
  await drainJobs();
  return { files, unknown };
}
