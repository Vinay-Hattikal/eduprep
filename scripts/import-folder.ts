// Imports a content folder (e.g. mock-data/ or a content repository checkout) through the normal
// import pipeline, in dependency order. Everything lands as drafts for review, exactly as if each
// file had been uploaded in admin › Imports. Layout: src/server/imports/folder.ts and
// docs/content-workflow.md.
//
//   npm run content:import -- mock-data
//   npm run content:import -- ../content/04-companies/..   (any folder in the same layout)
//
// Safe to run again: unchanged rows are skipped. Exits with 1 if any file failed.

import path from "node:path";
import { db } from "@/server/db";
import { importFolder } from "@/server/imports/import-folder";

async function main() {
  const folder = process.argv[2];
  if (!folder) throw new Error("Usage: npm run content:import -- <folder>");
  const root = path.resolve(folder);

  const admin = await db.user.findFirst({ where: { roles: { has: "SUPER_ADMIN" } } });
  if (!admin) throw new Error("No super admin found. Run `npm run db:seed` first.");

  const { files, unknown } = await importFolder(root, admin.id, (result) => {
    const mark = { imported: "✓", failed: "✗", skipped: "–" }[result.outcome];
    const counts =
      result.outcome === "skipped"
        ? ""
        : `created ${result.created ?? 0}, updated ${result.updated ?? 0}, unchanged ${result.unchanged ?? 0}`;
    console.log(`${mark} ${result.file.path.padEnd(52)} ${result.file.type.padEnd(22)} ${counts}`);
    for (const problem of result.problems) console.log(`    ${problem}`);
  });

  for (const file of unknown) console.log(`? ${file}: not in the folder layout, not imported`);
  const failed = files.filter((f) => f.outcome === "failed").length;
  console.log(
    `\n${files.length - failed} of ${files.length} file(s) imported as drafts` +
      (unknown.length ? `, ${unknown.length} not recognised` : "") +
      ". Review and publish them in admin.",
  );
  await db.$disconnect();
  if (failed || unknown.length) process.exit(1);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await db.$disconnect();
  process.exit(1);
});
