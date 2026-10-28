import type { Prisma } from "@/generated/prisma/client";
import type { ImportRowAction, ImportType } from "@/generated/prisma/enums";
import type { Permission } from "@/lib/permissions";
import type { JobRequest } from "@/server/jobs/queue";
import type { ParsedFile, ParsedRow } from "@/server/imports/parse";

export type RowMessage = { level: "error" | "warning"; column?: string; message: string };

/** One row after validation. `value` is set when the row has no errors. */
export type ValidatedRow<T> = {
  rowNumber: number;
  cells: Record<string, string>;
  value: T | null;
  messages: RowMessage[];
  /** What committing would do. Null for rows with errors. */
  action: ImportRowAction | null;
  /** The existing record's id, for updates. */
  existingId?: string;
};

export type CommitOutcome = {
  rowNumber: number;
  entityId: string;
  action: ImportRowAction;
  /** Snapshot before an update, so the batch can be rolled back. */
  previous?: Prisma.InputJsonValue;
};

export type CommitContext = {
  tx: Prisma.TransactionClient;
  actorId: string | null;
  batchId: string;
};

export type RollbackRow = {
  entityId: string;
  action: ImportRowAction;
  previous: Prisma.JsonValue | null;
};

export type ColumnSpec = { name: string; required: boolean };

/** A database client or transaction; validation only reads. */
export type DbReader = Prisma.TransactionClient;

export interface ImportDefinition<T> {
  type: ImportType;
  label: string;
  description: string;
  /** Who may upload this type. */
  permission: Permission;
  /** Template file under docs/templates. */
  template: string;
  allowZip: boolean;
  columns: readonly ColumnSpec[];
  validate(rows: ParsedRow[], file: ParsedFile, db: DbReader): Promise<ValidatedRow<T>[]>;
  /** Writes rows (all valid, action CREATE or UPDATE) inside the caller's transaction. */
  commit(rows: ValidatedRow<T>[], ctx: CommitContext): Promise<CommitOutcome[]>;
  /** Uploads files the rows reference (images), before the transaction. */
  prepareFiles?(rows: ValidatedRow<T>[], file: ParsedFile): Promise<void>;
  /** Undo support. Returns a reason when the batch can't be rolled back. */
  rollback?: {
    check(rows: RollbackRow[], batchId: string, db: DbReader): Promise<string | null>;
    apply(rows: RollbackRow[], tx: Prisma.TransactionClient): Promise<void>;
  };
  /** Reads the upload itself instead of the standard CSV/XLSX/ZIP parser (no column check). */
  parse?(fileName: string, data: Uint8Array): Promise<ParsedFile>;
  /**
   * Rows written per transaction (default 500). Importers whose rows depend on each other
   * (e.g. all test cases of one problem) use a single transaction.
   */
  commitChunkSize?: number;
  /** Background jobs to queue once every row is written (e.g. checking problems in the judge). */
  followUpJobs?(outcomes: CommitOutcome[]): JobRequest[];
  /** "Replace all" support (D-054): the file becomes the full set for its scope. */
  replace?: ReplaceSupport;
  /** An older multi-file format: still accepted, listed under "Older formats" (D-054). */
  legacy?: boolean;
}

/**
 * Replace mode: items in scope but missing from the file are archived (never deleted, so student
 * history stays). A backup export is stored first.
 */
export type ReplaceSupport = {
  /** What a replace covers, for the admin: "every coding problem". */
  scope(file: ParsedFile): string;
  /** Items in scope that aren't in the file and aren't archived yet. */
  missing(file: ParsedFile, db: DbReader): Promise<{ id: string; label: string }[]>;
  archive(ids: string[], tx: Prisma.TransactionClient): Promise<void>;
  /** Export of everything in scope, in this import's own format. */
  backup(file: ParsedFile, db: DbReader): Promise<{ fileName: string; csv: string }>;
};

/** Finalises a row: no errors → keeps value and action. */
export function finishRow<T>(
  row: ParsedRow,
  messages: RowMessage[],
  value: T | undefined,
  action: ImportRowAction | null,
  existingId?: string,
): ValidatedRow<T> {
  const failed = messages.some((m) => m.level === "error") || value === undefined;
  return {
    rowNumber: row.rowNumber,
    cells: row.cells,
    value: failed ? null : value,
    messages,
    action: failed ? null : action,
    existingId: failed ? undefined : existingId,
  };
}

/** Stable comparison for "did anything change?" checks. */
export function sameValues(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalize(v ?? null)]),
    );
  }
  return value ?? null;
}

/** What a super admin types to confirm a replace (D-054). */
export const REPLACE_CONFIRMATION = "REPLACE";
