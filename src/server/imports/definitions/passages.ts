// Passage import: shared reading passages and data tables (data-import.md 4.2).

import { findAssetReferences, rewriteAssetLinks } from "@/lib/content/assets";
import { assetUrls, checkAssetReferences, hashAssets, storeAssets } from "@/server/imports/assets";
import { CellReader } from "@/server/imports/cells";
import type { ParsedRow } from "@/server/imports/parse";
import {
  finishRow,
  type DbReader,
  type ImportDefinition,
  type ValidatedRow,
} from "@/server/imports/types";

export type PassageValue = { externalId: string; title: string; body: string };

export type PassageContext = { existing: Map<string, { id: string; title: string; body: string }> };

export function validatePassageRows(
  rows: ParsedRow[],
  ctx: PassageContext,
  assets: Map<string, Uint8Array>,
): ValidatedRow<PassageValue>[] {
  const urls = assetUrls(hashAssets(assets));
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const r = new CellReader(row.cells);
    const externalId = r.externalId("external_id");
    const title = r.required("title");
    const body = r.markdown("body");
    checkAssetReferences(r, "body", body, assets);

    if (externalId) {
      const first = seen.get(externalId);
      if (first) r.error("external_id", `Same ID as row ${first}.`);
      else seen.set(externalId, row.rowNumber);
    }
    if (r.hasErrors || !externalId || !title || !body)
      return finishRow<PassageValue>(row, r.messages, undefined, null);

    const value = { externalId, title, body: rewriteAssetLinks(body, urls) };
    const existing = ctx.existing.get(externalId);
    const action = !existing
      ? "CREATE"
      : existing.title === value.title && existing.body === value.body
        ? "UNCHANGED"
        : "UPDATE";
    return finishRow(row, r.messages, value, action, existing?.id);
  });
}

async function loadPassageContext(db: DbReader, rows: ParsedRow[]): Promise<PassageContext> {
  const ids = rows.map((row) => row.cells.external_id?.trim()).filter(Boolean) as string[];
  const existing = await db.passage.findMany({ where: { externalId: { in: ids } } });
  return { existing: new Map(existing.map((p) => [p.externalId, p])) };
}

export const passageImport: ImportDefinition<PassageValue> = {
  type: "PASSAGES",
  label: "Passages",
  description: "Reading passages and data tables shared by several questions.",
  permission: "content.edit",
  template: "passages.csv",
  allowZip: true,
  columns: [
    { name: "external_id", required: true },
    { name: "title", required: true },
    { name: "body", required: true },
  ],

  async validate(rows, file, db) {
    return validatePassageRows(rows, await loadPassageContext(db, rows), file.assets);
  },

  async prepareFiles(rows, file) {
    const names = rows.flatMap((row) => findAssetReferences(row.cells.body ?? ""));
    await storeAssets(names, file.assets, hashAssets(file.assets));
  },

  async commit(rows, { tx }) {
    const outcomes = [];
    for (const row of rows) {
      const { externalId, title, body } = row.value!;
      const before = await tx.passage.findUnique({ where: { externalId } });
      const record = await tx.passage.upsert({
        where: { externalId },
        create: { externalId, title, body },
        update: { title, body },
      });
      outcomes.push({
        rowNumber: row.rowNumber,
        entityId: record.id,
        action: before ? ("UPDATE" as const) : ("CREATE" as const),
        previous: before ? { title: before.title, body: before.body } : undefined,
      });
    }
    return outcomes;
  },

  rollback: {
    async check(rows, _batchId, db) {
      const created = rows.filter((row) => row.action === "CREATE").map((row) => row.entityId);
      const used = await db.question.count({ where: { passageId: { in: created } } });
      return used > 0 ? "Some new passages are already used by questions." : null;
    },
    async apply(rows, tx) {
      for (const row of rows) {
        if (row.action === "CREATE") {
          await tx.passage.delete({ where: { id: row.entityId } });
        } else {
          const previous = row.previous as { title: string; body: string };
          await tx.passage.update({ where: { id: row.entityId }, data: previous });
        }
      }
    },
  },
};
