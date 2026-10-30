// "Asked at" links typed in the admin editors (D-057): which companies ask a question or coding
// problem, and optionally in which months. Pure, so the rules are unit-tested and shared with
// the forms.

export const MAX_COMPANY_LINKS = 50;
export const MAX_MONTHS = 24;

export type AskedAtInput = { companyId: string; askedIn: string };
export type AskedAt = { companyId: string; askedIn: string[] };

const MONTH = /^(\d{4})-(\d{2})$/;

/**
 * "2026-08, 2026-09" → ["2026-09", "2026-08"] (newest first, no repeats). Future months and
 * badly written ones are errors.
 */
export function parseMonths(text: string, today: Date): { months: string[]; error?: string } {
  const thisMonth = today.toISOString().slice(0, 7);
  const months = new Set<string>();
  for (const part of text.split(/[,|\s]+/).filter(Boolean)) {
    const match = MONTH.exec(part);
    const month = match ? Number(match[2]) : 0;
    if (!match || month < 1 || month > 12)
      return { months: [], error: `"${part}" isn't a month. Write it like 2026-08.` };
    if (part > thisMonth) return { months: [], error: `${part} is in the future.` };
    months.add(part);
  }
  if (months.size > MAX_MONTHS) return { months: [], error: `At most ${MAX_MONTHS} months.` };
  return { months: [...months].sort().reverse() };
}

/** Checks the editor's company rows: no blanks, no repeats, valid months. */
export function readAskedAt(
  rows: readonly AskedAtInput[],
  today: Date,
): { links: AskedAt[]; error?: string } {
  const links: AskedAt[] = [];
  for (const row of rows) {
    if (!row.companyId) {
      if (row.askedIn.trim()) return { links: [], error: "Choose the company for those months." };
      continue;
    }
    if (links.some((l) => l.companyId === row.companyId))
      return { links: [], error: "The same company is listed twice." };
    const { months, error } = parseMonths(row.askedIn, today);
    if (error) return { links: [], error };
    links.push({ companyId: row.companyId, askedIn: months });
  }
  if (links.length > MAX_COMPANY_LINKS)
    return { links: [], error: `At most ${MAX_COMPANY_LINKS} companies.` };
  return { links };
}

/** "QA-PCT-0042" → "QA-PCT-0043": the next ID with the same prefix and width, or "" if none. */
export function nextExternalId(id: string): string {
  const match = /^(.*?)(\d+)$/.exec(id);
  if (!match) return "";
  const [, prefix, digits] = match as unknown as [string, string, string];
  const next = String(Number(digits) + 1).padStart(digits.length, "0");
  const candidate = `${prefix}${next}`;
  return candidate.length <= 64 ? candidate : "";
}

/** Reads the parallel `companyId` and `askedIn` fields the "Asked at" editor submits. */
export function askedAtFromFormData(formData: FormData): AskedAtInput[] {
  const ids = formData.getAll("companyId").map(String);
  const months = formData.getAll("askedIn").map(String);
  return ids.map((companyId, i) => ({ companyId, askedIn: months[i] ?? "" }));
}

/** "Asked at Acme, Globex and 2 more" for share images. */
export function askedAt(names: string[]): string | undefined {
  if (!names.length) return undefined;
  const shown = names.slice(0, 2).join(", ");
  return names.length > 2 ? `Asked at ${shown} and ${names.length - 2} more` : `Asked at ${shown}`;
}
