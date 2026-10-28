// Reads and validates the text cells of one CSV row. Every problem is recorded against its
// column so the preview can show "difficulty: must be easy, medium or hard".
// Pure (no DB), so importers' row rules are unit-tested directly.

import type { RowMessage } from "@/server/imports/types";

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;

export class CellReader {
  readonly messages: RowMessage[] = [];

  constructor(private readonly cells: Record<string, string>) {}

  error(column: string | undefined, message: string) {
    this.messages.push({ level: "error", column, message });
  }

  warn(column: string | undefined, message: string) {
    this.messages.push({ level: "warning", column, message });
  }

  get hasErrors(): boolean {
    return this.messages.some((m) => m.level === "error");
  }

  /** Raw cell, keeping inner whitespace and line breaks (for Markdown and code). */
  raw(column: string): string {
    return this.cells[column] ?? "";
  }

  optional(column: string): string | undefined {
    const value = this.raw(column).trim();
    return value === "" ? undefined : value;
  }

  required(column: string): string | undefined {
    const value = this.optional(column);
    if (value === undefined) this.error(column, "Required.");
    return value;
  }

  /** Required Markdown text: trims the ends but keeps inner formatting. */
  markdown(column: string, { required = true } = {}): string | undefined {
    const value = this.raw(column).replace(/^\s+|\s+$/g, "");
    if (!value) {
      if (required) this.error(column, "Required.");
      return undefined;
    }
    return value;
  }

  slug(column: string, { required = true } = {}): string | undefined {
    const value = required ? this.required(column) : this.optional(column);
    if (value !== undefined && !SLUG.test(value)) {
      this.error(
        column,
        `"${value}" isn't a valid slug. Use lowercase letters, digits and hyphens.`,
      );
      return undefined;
    }
    return value;
  }

  externalId(column: string): string | undefined {
    const value = this.required(column);
    if (value !== undefined && !EXTERNAL_ID.test(value)) {
      this.error(column, `"${value}" isn't a valid ID. Use letters, digits and hyphens (max 64).`);
      return undefined;
    }
    return value;
  }

  int(
    column: string,
    { min, max, required = true }: { min?: number; max?: number; required?: boolean } = {},
  ): number | undefined {
    const value = required ? this.required(column) : this.optional(column);
    if (value === undefined) return undefined;
    if (!/^-?\d+$/.test(value)) {
      this.error(column, `"${value}" isn't a whole number.`);
      return undefined;
    }
    return this.inRange(column, Number(value), min, max);
  }

  float(
    column: string,
    { min, max, required = true }: { min?: number; max?: number; required?: boolean } = {},
  ): number | undefined {
    const value = required ? this.required(column) : this.optional(column);
    if (value === undefined) return undefined;
    const number = Number(value);
    if (!/^-?\d+(\.\d+)?$/.test(value) || !Number.isFinite(number)) {
      this.error(column, `"${value}" isn't a number.`);
      return undefined;
    }
    return this.inRange(column, number, min, max);
  }

  private inRange(column: string, value: number, min?: number, max?: number) {
    if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
      const range =
        min !== undefined && max !== undefined
          ? `between ${min} and ${max}`
          : min !== undefined
            ? `at least ${min}`
            : `at most ${max}`;
      this.error(column, `Must be ${range}.`);
      return undefined;
    }
    return value;
  }

  /** Case-insensitive choice from a fixed list, mapped to a stored value. */
  choice<T>(column: string, choices: Record<string, T>, { required = true } = {}): T | undefined {
    const value = required ? this.required(column) : this.optional(column);
    if (value === undefined) return undefined;
    const key = value.toLowerCase();
    if (!Object.hasOwn(choices, key)) {
      this.error(
        column,
        `"${value}" isn't allowed. Use one of: ${Object.keys(choices).join(", ")}.`,
      );
      return undefined;
    }
    return choices[key];
  }

  /** Pipe-separated list; blanks removed. */
  list(column: string): string[] {
    return (this.optional(column) ?? "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  yesNo(column: string, { required = false } = {}): boolean | undefined {
    return this.choice(column, { yes: true, no: false, true: true, false: false }, { required });
  }

  date(column: string, { required = true } = {}): Date | undefined {
    const value = required ? this.required(column) : this.optional(column);
    if (value === undefined) return undefined;
    const match = DATE.exec(value);
    const date = match ? new Date(Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!)) : null;
    if (!date || date.getUTCMonth() !== +match![2]! - 1 || date.getUTCDate() !== +match![3]!) {
      this.error(column, `"${value}" isn't a valid date. Use YYYY-MM-DD.`);
      return undefined;
    }
    return date;
  }

  /** Pipe-separated YYYY-MM months, not in the future. */
  months(column: string, today: Date): string[] {
    const current = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
    const months: string[] = [];
    for (const value of this.list(column)) {
      const match = MONTH.exec(value);
      if (!match || +match[2]! < 1 || +match[2]! > 12) {
        this.error(column, `"${value}" isn't a valid month. Use YYYY-MM.`);
      } else if (value > current) {
        this.error(column, `${value} is in the future.`);
      } else if (!months.includes(value)) {
        months.push(value);
      }
    }
    return months.sort().reverse();
  }

  url(column: string, { required = true } = {}): string | undefined {
    const value = required ? this.required(column) : this.optional(column);
    if (value === undefined) return undefined;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
      return value;
    } catch {
      this.error(column, `"${value}" isn't a valid http(s) link.`);
      return undefined;
    }
  }
}
