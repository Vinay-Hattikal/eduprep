// Reads an uploaded CSV, XLSX or ZIP (table + assets/ folder) into rows of text cells.
// Format rules: docs/data-import.md section 2.

import { unzipSync } from "fflate";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";
import { imageExtension, MAX_IMAGE_BYTES } from "@/lib/content/assets";

export const MAX_ROWS = 20_000;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".zip"] as const;

export const NO_ROWS_MESSAGE = "The file has column names but no rows.";

export type ParsedRow = { rowNumber: number; cells: Record<string, string> };

export type ParsedFile = {
  headers: string[];
  rows: ParsedRow[];
  /** Images from the ZIP's assets/ folder, by file name. */
  assets: Map<string, Uint8Array>;
};

/** A problem with the file itself, shown to the admin as-is. */
export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

function toTable(matrix: string[][]): Omit<ParsedFile, "assets"> {
  const [headerRow, ...body] = matrix;
  if (!headerRow || headerRow.every((cell) => !cell.trim())) {
    throw new ImportFileError("The file is empty. The first row must contain the column names.");
  }

  const headers = headerRow.map((cell) => cell.replace(/^﻿/, "").trim());
  const seen = new Set<string>();
  for (const header of headers) {
    if (!header) throw new ImportFileError("A column in the first row has no name.");
    if (seen.has(header)) throw new ImportFileError(`The column "${header}" appears twice.`);
    seen.add(header);
  }

  const rows: ParsedRow[] = [];
  body.forEach((cells, index) => {
    if (cells.every((cell) => !cell.trim())) return; // skip blank lines
    if (cells.length > headers.length && cells.slice(headers.length).some((c) => c.trim())) {
      throw new ImportFileError(
        `Row ${index + 2} has more cells than there are columns. Check for an unquoted comma.`,
      );
    }
    const record: Record<string, string> = {};
    headers.forEach((header, column) => {
      record[header] = (cells[column] ?? "").replace(/\r\n/g, "\n");
    });
    rows.push({ rowNumber: index + 2, cells: record });
  });

  if (rows.length === 0) throw new ImportFileError(NO_ROWS_MESSAGE);
  if (rows.length > MAX_ROWS) {
    throw new ImportFileError(
      `The file has ${rows.length} rows; the limit is ${MAX_ROWS}. Split it.`,
    );
  }
  return { headers, rows };
}

export function parseCsv(data: Uint8Array): Omit<ParsedFile, "assets"> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new ImportFileError('The file isn\'t valid UTF-8. Export it as "CSV UTF-8".');
  }
  // Always comma-separated (data-import.md). Never auto-detect: pipes inside cells (A|C) would
  // fool the detector.
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    delimiter: ",",
    skipEmptyLines: false,
  });
  const quoteError = result.errors.find((error) => error.type === "Quotes");
  if (quoteError) {
    throw new ImportFileError(
      `Row ${(quoteError.row ?? 0) + 1}: a quoted cell is never closed. Check the double quotes.`,
    );
  }
  return toTable(result.data);
}

function cellToText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "boolean") return cell ? "yes" : "no";
  return String(cell);
}

export async function parseXlsx(data: Uint8Array): Promise<Omit<ParsedFile, "assets">> {
  let sheet: unknown[][];
  try {
    sheet = (await readSheet(Buffer.from(data))) as unknown[][];
  } catch {
    throw new ImportFileError("The spreadsheet couldn't be read. Save it as .xlsx and try again.");
  }
  return toTable(sheet.map((row) => row.map(cellToText)));
}

async function parseZip(data: Uint8Array): Promise<ParsedFile> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch {
    throw new ImportFileError("The ZIP file couldn't be opened.");
  }

  const files = Object.entries(entries).filter(
    ([name]) =>
      !name.endsWith("/") &&
      !name.startsWith("__MACOSX/") &&
      !name.split("/").pop()!.startsWith("."),
  );
  const tables = files.filter(
    ([name]) => !/(^|\/)assets\//.test(name) && [".csv", ".xlsx"].includes(extensionOf(name)),
  );
  if (tables.length !== 1) {
    throw new ImportFileError(
      `The ZIP must contain exactly one .csv or .xlsx file (found ${tables.length}), plus an optional assets/ folder.`,
    );
  }

  const assets = new Map<string, Uint8Array>();
  for (const [name, bytes] of files) {
    const match = /(?:^|\/)assets\/(.+)$/.exec(name);
    if (!match) continue;
    const assetName = match[1]!;
    if (!imageExtension(assetName)) {
      throw new ImportFileError(
        `assets/${assetName}: only PNG, JPG, WEBP and SVG images are allowed.`,
      );
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new ImportFileError(`assets/${assetName} is larger than 1 MB.`);
    }
    assets.set(assetName, bytes);
  }

  const [tableName, tableBytes] = tables[0]!;
  const table =
    extensionOf(tableName) === ".csv" ? parseCsv(tableBytes) : await parseXlsx(tableBytes);
  return { ...table, assets };
}

export async function parseImportFile(
  fileName: string,
  data: Uint8Array,
  options: { allowZip: boolean },
): Promise<ParsedFile> {
  const extension = extensionOf(fileName);
  if (extension === ".csv") return { ...parseCsv(data), assets: new Map() };
  if (extension === ".xlsx") return { ...(await parseXlsx(data)), assets: new Map() };
  if (extension === ".zip") {
    if (!options.allowZip) throw new ImportFileError("This import type doesn't accept ZIP files.");
    return parseZip(data);
  }
  throw new ImportFileError("Upload a .csv, .xlsx or .zip file.");
}

/** Builds a CSV from rows, quoting as needed. Used for the failed-rows download. */
export function toCsv(headers: string[], rows: Record<string, string>[]): string {
  return Papa.unparse({
    fields: headers,
    data: rows.map((row) => headers.map((h) => row[h] ?? "")),
  });
}
