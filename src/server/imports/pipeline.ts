// The import pipeline (data-import.md section 6):
// upload -> validate (job) -> preview -> confirm -> commit (job) -> report, plus rollback.
// Validation and commit run in the background worker; they are safe to retry.

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { ImportMode, ImportRowStatus, ImportType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { enqueueJob } from "@/server/jobs/queue";
import { storage } from "@/server/integrations/storage";
import { ImportFileError, parseImportFile, toCsv, type ParsedFile } from "@/server/imports/parse";
import {
  PUBLISHABLE_IMPORTS,
  publishImported,
  publishesThroughJudge,
} from "@/server/imports/publish";
import { COMPANY_IMPORT_FIELDS, fillCompanyCells } from "@/server/imports/company-links";
import { getImportDefinition } from "@/server/imports/registry";
import type { CommitOutcome, RowMessage, ValidatedRow } from "@/server/imports/types";
import { recordAudit } from "@/server/services/audit";

const COMMIT_CHUNK = 500;
const ROW_WRITE_CHUNK = 1000;
/** How many items a replace preview names before "and N more". */
const ARCHIVE_PREVIEW = 20;

export class ImportActionError extends Error {}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(-100) || "upload";
}

/** Stores the upload and queues validation. */
export async function createImportBatch(input: {
  type: ImportType;
  fileName: string;
  data: Uint8Array;
  actorId: string | null;
  /** REPLACE is for super admins only; callers check the role (D-054). */
  mode?: ImportMode;
  /** Set when the file came in a content pack (D-061). */
  packId?: string;
  /** False when the caller runs validation itself (content packs), so no job runs it twice. */
  queue?: boolean;
  /** "Import for this company" (D-067): rows without companies are tagged with it. */
  companyId?: string;
}): Promise<string> {
  const mode = input.mode ?? "ADD_UPDATE";
  if (mode === "REPLACE" && !getImportDefinition(input.type).replace)
    throw new ImportActionError("This file type can't be imported in replace mode.");
  const id = randomUUID().replace(/-/g, "").slice(0, 24);
  const fileKey = `imports/${id}/${safeFileName(input.fileName)}`;
  await storage.put(fileKey, input.data);

  await db.importBatch.create({
    data: {
      id,
      type: input.type,
      mode,
      fileName: input.fileName.slice(0, 200),
      fileKey,
      fileSize: input.data.byteLength,
      uploadedById: input.actorId,
      packId: input.packId ?? null,
      companyId: input.companyId ?? null,
    },
  });
  await recordAudit({
    actorId: input.actorId,
    action: "import.upload",
    entityType: "import",
    entityId: id,
    after: { type: input.type, fileName: input.fileName, mode },
  });
  if (input.queue !== false) await enqueueJob("import.validate", { batchId: id });
  return id;
}

async function readBatchFile(batch: {
  fileKey: string;
  fileName: string;
  type: ImportType;
  companyId: string | null;
}): Promise<ParsedFile> {
  const data = await storage.get(batch.fileKey);
  if (!data)
    throw new ImportFileError("The uploaded file is missing from storage. Upload it again.");
  const definition = getImportDefinition(batch.type);
  if (definition.parse) return definition.parse(batch.fileName, data);
  const parsed = await parseImportFile(batch.fileName, data, { allowZip: definition.allowZip });

  const known = new Set(definition.columns.map((c) => c.name));
  const missing = definition.columns.filter((c) => c.required && !parsed.headers.includes(c.name));
  const unknown = parsed.headers.filter((h) => !known.has(h));
  const problems = [
    missing.length ? `Missing columns: ${missing.map((c) => c.name).join(", ")}.` : "",
    unknown.length
      ? `Unknown columns: ${unknown.join(", ")}. Check the spelling against the template.`
      : "",
  ].filter(Boolean);
  if (problems.length) throw new ImportFileError(problems.join(" "));
  // "Import for this company" (D-067): an empty companies cell means this company. Files without
  // the column keep every item's links and get this company added after the commit instead.
  if (batch.companyId && parsed.headers.includes("companies")) {
    const company = await db.company.findUnique({
      where: { id: batch.companyId },
      select: { slug: true },
    });
    if (company) fillCompanyCells(parsed.rows, company.slug);
  }
  return parsed;
}

function rowStatus(row: ValidatedRow<unknown>): ImportRowStatus {
  if (row.messages.some((m) => m.level === "error") || !row.value) return "ERROR";
  return row.messages.length ? "WARNING" : "VALID";
}

async function failBatch(batchId: string, error: unknown) {
  const message =
    error instanceof ImportFileError
      ? error.message
      : "Something went wrong while processing the file.";
  await db.importBatch.update({
    where: { id: batchId },
    data: { status: "FAILED", error: message },
  });
  if (!(error instanceof ImportFileError)) throw error; // let the job retry real crashes
}

/** Job: parse and validate every row, store results for the preview. */
export async function validateBatch(batchId: string): Promise<void> {
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || !["QUEUED", "VALIDATING"].includes(batch.status)) return;
  await db.importBatch.update({
    where: { id: batchId },
    data: { status: "VALIDATING", error: null },
  });

  try {
    const file = await readBatchFile(batch);
    const definition = getImportDefinition(batch.type);
    const results = await definition.validate(file.rows, file, db);
    const missing =
      batch.mode === "REPLACE" && definition.replace
        ? await definition.replace.missing(file, db)
        : [];

    await db.importRow.deleteMany({ where: { batchId } });
    for (let i = 0; i < results.length; i += ROW_WRITE_CHUNK) {
      await db.importRow.createMany({
        data: results.slice(i, i + ROW_WRITE_CHUNK).map((row) => ({
          batchId,
          rowNumber: row.rowNumber,
          data: row.cells,
          status: rowStatus(row),
          action: row.action,
          messages: row.messages as Prisma.InputJsonValue,
          entityId: row.existingId ?? null,
        })),
      });
    }

    const statuses = results.map(rowStatus);
    await db.importBatch.update({
      where: { id: batchId },
      data: {
        status: "PREVIEW_READY",
        totalRows: results.length,
        validRows: statuses.filter((s) => s === "VALID").length,
        warningRows: statuses.filter((s) => s === "WARNING").length,
        errorRows: statuses.filter((s) => s === "ERROR").length,
        archiveCount: missing.length,
        archivePreview: missing.slice(0, ARCHIVE_PREVIEW).map((m) => m.label),
        validatedAt: new Date(),
      },
    });
  } catch (error) {
    await failBatch(batchId, error);
  }
}

/** Admin confirmed the preview: queue the commit. */
export async function confirmBatch(
  batchId: string,
  actorId: string,
  { publish = false, queue = true } = {},
): Promise<void> {
  const updated = await db.importBatch.updateMany({
    where: {
      id: batchId,
      status: "PREVIEW_READY",
      OR: [{ validRows: { gt: 0 } }, { warningRows: { gt: 0 } }],
    },
    data: {
      status: "COMMITTING",
      confirmedById: actorId,
      confirmedAt: new Date(),
      publishAfterImport: publish,
    },
  });
  if (updated.count === 0)
    throw new ImportActionError("This import can't be confirmed in its current state.");
  if (queue) await enqueueJob("import.commit", { batchId });
}

export async function cancelBatch(batchId: string, actorId: string): Promise<void> {
  const updated = await db.importBatch.updateMany({
    where: { id: batchId, status: { in: ["PREVIEW_READY", "FAILED"] } },
    data: { status: "CANCELLED" },
  });
  if (updated.count === 0)
    throw new ImportActionError("Only imports waiting for confirmation can be cancelled.");
  await recordAudit({ actorId, action: "import.cancel", entityType: "import", entityId: batchId });
}

/**
 * Job: write the rows. Re-validates against the current database first (things may have changed
 * since the preview), then commits in transactions of 500 rows.
 */
export async function commitBatch(batchId: string): Promise<void> {
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status !== "COMMITTING") return;
  const definition = getImportDefinition(batch.type);

  let file: ParsedFile;
  let results: ValidatedRow<unknown>[];
  try {
    file = await readBatchFile(batch);
    results = await definition.validate(file.rows, file, db);
  } catch (error) {
    await failBatch(batchId, error);
    return;
  }

  // Commit only rows the admin saw as importable in the preview, and not already imported
  // (a retried job picks up where it stopped).
  const previewed = await db.importRow.findMany({
    where: { batchId },
    select: { rowNumber: true, status: true },
  });
  const importable = new Set(
    previewed.filter((r) => r.status === "VALID" || r.status === "WARNING").map((r) => r.rowNumber),
  );
  const pending = results.filter((row) => importable.has(row.rowNumber));

  const setRow = (rowNumber: number, data: Prisma.ImportRowUpdateManyMutationInput) =>
    db.importRow.updateMany({ where: { batchId, rowNumber }, data });

  // Rows that were valid at preview but aren't any more.
  for (const row of pending.filter((r) => !r.value)) {
    await setRow(row.rowNumber, {
      status: "FAILED",
      messages: row.messages as Prisma.InputJsonValue,
    });
  }

  for (const row of pending.filter((r) => r.value && r.action === "UNCHANGED")) {
    await setRow(row.rowNumber, {
      status: "IMPORTED",
      action: "UNCHANGED",
      entityId: row.existingId ?? null,
    });
  }

  // Replace: keep a copy of everything in scope before anything changes.
  if (batch.mode === "REPLACE" && definition.replace && !batch.backupKey) {
    const backup = await definition.replace.backup(file, db);
    const backupKey = `imports/${batchId}/backup-${safeFileName(backup.fileName)}`;
    await storage.put(backupKey, new TextEncoder().encode(backup.csv));
    await db.importBatch.update({ where: { id: batchId }, data: { backupKey } });
  }

  const writable = pending.filter((r) => r.value && r.action !== "UNCHANGED");
  if (definition.prepareFiles) await definition.prepareFiles(writable, file);

  const chunkSize = definition.commitChunkSize ?? COMMIT_CHUNK;
  const allOutcomes: CommitOutcome[] = [];
  for (let i = 0; i < writable.length; i += chunkSize) {
    const chunk = writable.slice(i, i + chunkSize);
    try {
      const outcomes = await db.$transaction(
        (tx) => definition.commit(chunk, { tx, actorId: batch.confirmedById, batchId }),
        { timeout: 120_000 },
      );
      allOutcomes.push(...outcomes);
      for (const outcome of outcomes) {
        await setRow(outcome.rowNumber, {
          status: "IMPORTED",
          action: outcome.action,
          entityId: outcome.entityId,
          previous: outcome.previous ?? undefined,
        });
      }
    } catch (error) {
      const message: RowMessage = {
        level: "error",
        message: `Couldn't be saved: ${error instanceof Error ? error.message.split("\n").pop() : "unknown error"}`,
      };
      for (const row of chunk) {
        await setRow(row.rowNumber, {
          status: "FAILED",
          messages: [...row.messages, message] as Prisma.InputJsonValue,
        });
      }
    }
  }

  // "Import for this company" without a companies column: link every imported item, unchanged
  // ones too, keeping the companies each was already linked to.
  const linkField = batch.companyId && COMPANY_IMPORT_FIELDS[batch.type];
  if (linkField && !file.headers.includes("companies")) {
    const imported = await db.importRow.findMany({
      where: { batchId, status: "IMPORTED", entityId: { not: null } },
      select: { entityId: true },
    });
    if (imported.length) {
      await db.companyItem.createMany({
        data: imported.map((r) => ({ companyId: batch.companyId!, [linkField]: r.entityId! })),
        skipDuplicates: true,
      });
      await db.company.update({ where: { id: batch.companyId! }, data: { updatedAt: new Date() } });
    }
  }

  const publishBy =
    batch.publishAfterImport && batch.confirmedById && PUBLISHABLE_IMPORTS.includes(batch.type)
      ? batch.confirmedById
      : null;
  for (const job of allOutcomes.length ? (definition.followUpJobs?.(allOutcomes) ?? []) : []) {
    // Coding problems publish once the judge check passes (D-056).
    const payload =
      publishBy && job.type === "problem.validate" ? { ...job.payload, publishBy } : job.payload;
    await enqueueJob(job.type, payload as never);
  }

  const counts = await db.importRow.groupBy({
    by: ["status", "action"],
    where: { batchId },
    _count: { _all: true },
  });
  const count = (status: ImportRowStatus, action?: string) =>
    counts
      .filter((c) => c.status === status && (!action || c.action === action))
      .reduce((n, c) => n + c._count._all, 0);
  const imported = count("IMPORTED");
  const failed = count("FAILED");

  // Replace: archive what the file no longer lists (never deletes: student history stays).
  let archivedCount = 0;
  if (batch.mode === "REPLACE" && definition.replace && !(imported === 0 && failed > 0)) {
    const missing = await definition.replace.missing(file, db);
    if (missing.length) {
      await db.$transaction(
        (tx) =>
          definition.replace!.archive(
            missing.map((m) => m.id),
            tx,
          ),
        {
          timeout: 120_000,
        },
      );
      archivedCount = missing.length;
    }
    await recordAudit({
      actorId: batch.confirmedById,
      action: "import.replace",
      entityType: "import",
      entityId: batchId,
      after: { type: batch.type, archived: archivedCount, items: missing.map((m) => m.label) },
    });
  }

  // "Publish after import" (D-056). The import itself has succeeded by now, so a problem while
  // publishing is recorded on the batch instead of leaving it stuck in COMMITTING.
  let publishedCount = 0;
  let publishError: string | null = null;
  if (publishBy && !publishesThroughJudge(batch.type) && imported > 0) {
    try {
      publishedCount = await publishImported(batchId, batch.type, publishBy);
    } catch (error) {
      publishError = `Imported, but publishing stopped part-way: ${error instanceof Error ? error.message.split("\n").pop() : "unknown error"}. Publish the rest from Drafts.`;
    }
  }

  await db.importBatch.update({
    where: { id: batchId },
    data: {
      status: imported === 0 && failed > 0 ? "FAILED" : "COMPLETED",
      error:
        imported === 0 && failed > 0
          ? "No rows could be imported. Download the failed rows to see why."
          : publishError,
      publishedCount,
      createdCount: count("IMPORTED", "CREATE"),
      updatedCount: count("IMPORTED", "UPDATE"),
      unchangedCount: count("IMPORTED", "UNCHANGED"),
      failedCount: failed,
      archivedCount,
      completedAt: new Date(),
    },
  });
  await recordAudit({
    actorId: batch.confirmedById,
    action: "import.commit",
    entityType: "import",
    entityId: batchId,
    after: {
      type: batch.type,
      created: count("IMPORTED", "CREATE"),
      updated: count("IMPORTED", "UPDATE"),
      failed,
    },
  });
}

/** Why a completed batch can't be rolled back, or null if it can. */
export async function rollbackBlocker(batchId: string): Promise<string | null> {
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status !== "COMPLETED") return "Only completed imports can be undone.";
  if (batch.mode === "REPLACE")
    return "a replace can't be undone automatically. Import its backup file to bring archived items back as drafts.";
  const definition = getImportDefinition(batch.type);
  if (!definition.rollback)
    return "This import type can't be undone. Fix the data and import again.";
  const rows = await changedRows(batchId);
  if (rows.length === 0) return "This import didn't change anything.";
  return definition.rollback.check(rows, batchId, db);
}

async function changedRows(batchId: string) {
  const rows = await db.importRow.findMany({
    where: { batchId, status: "IMPORTED", action: { in: ["CREATE", "UPDATE"] } },
    select: { entityId: true, action: true, previous: true },
  });
  return rows.map((row) => ({
    entityId: row.entityId!,
    action: row.action!,
    previous: row.previous,
  }));
}

export async function rollbackBatch(batchId: string, actorId: string): Promise<void> {
  const blocker = await rollbackBlocker(batchId);
  if (blocker) throw new ImportActionError(blocker);
  const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  const definition = getImportDefinition(batch.type);
  const rows = await changedRows(batchId);

  await db.$transaction(
    async (tx) => {
      await definition.rollback!.apply(rows, tx);
      await tx.importBatch.update({
        where: { id: batchId },
        data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
      });
      await recordAudit(
        {
          actorId,
          action: "import.rollback",
          entityType: "import",
          entityId: batchId,
          after: { rows: rows.length },
        },
        tx,
      );
    },
    { timeout: 120_000 },
  );
}

/** CSV of rows with errors, with an extra `error` column, for fixing and re-uploading. */
export async function failedRowsCsv(batchId: string): Promise<string | null> {
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) return null;
  const rows = await db.importRow.findMany({
    where: { batchId, status: { in: ["ERROR", "FAILED"] } },
    orderBy: { rowNumber: "asc" },
  });
  const columns = getImportDefinition(batch.type).columns.map((c) => c.name);
  return toCsv(
    [...columns, "error"],
    rows.map((row) => ({
      ...(row.data as Record<string, string>),
      error: (row.messages as RowMessage[])
        .filter((m) => m.level === "error")
        .map((m) => (m.column ? `${m.column}: ${m.message}` : m.message))
        .join(" | "),
    })),
  );
}
