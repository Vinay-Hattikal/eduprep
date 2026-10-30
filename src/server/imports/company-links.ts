// The optional `companies` and `asked_in` columns on question and coding files (D-054): a question
// is tagged with the companies that ask it where it's written, instead of in a separate map file.
//
// When the file has a `companies` column, it is the full list for that item: companies missing
// from the cell are unlinked. Files without the column leave links alone. `asked_in`, when
// filled, sets the months on every listed company; when blank, existing months are kept.

import type { ImportType } from "@/generated/prisma/enums";
import type { CellReader } from "@/server/imports/cells";
import type { DbReader } from "@/server/imports/types";
import type { Prisma } from "@/generated/prisma/client";
import type { Item, LinkKind } from "@/server/services/company-links";

export const COMPANY_LINK_COLUMNS = [
  { name: "companies", required: false },
  { name: "asked_in", required: false },
] as const;

/** null: the file has no companies column, so links are left as they are. */
export type CompanyLinks = { companyIds: string[]; askedIn: string[] | null } | null;

export type ExistingLink = { companyId: string; askedIn: string[] };

export function hasCompanyColumn(headers: readonly string[]): boolean {
  return headers.includes("companies");
}

export async function loadCompanySlugs(db: DbReader): Promise<Map<string, { id: string }>> {
  const companies = await db.company.findMany({ select: { id: true, slug: true } });
  return new Map(companies.map((c) => [c.slug, { id: c.id }]));
}

export function readCompanyLinks(
  r: CellReader,
  enabled: boolean,
  companies: Map<string, { id: string }>,
  today: Date,
): CompanyLinks {
  if (!enabled) {
    if (r.optional("asked_in")) r.warn("asked_in", "Ignored: add a companies column to use it.");
    return null;
  }
  const companyIds: string[] = [];
  for (const slug of r.list("companies")) {
    const company = companies.get(slug.toLowerCase());
    if (!company) r.error("companies", `Unknown company "${slug}". Import companies.csv first.`);
    else if (!companyIds.includes(company.id)) companyIds.push(company.id);
  }
  const months = r.months("asked_in", today);
  if (months.length && companyIds.length === 0)
    r.error("asked_in", "List the companies these months belong to.");
  return { companyIds: companyIds.sort(), askedIn: months.length ? months : null };
}

/** Warns, in the preview, about companies the row will unlink. */
export function warnUnlinked(
  r: CellReader,
  links: CompanyLinks,
  existing: readonly ExistingLink[],
  companies: Map<string, { id: string }>,
) {
  if (!links) return;
  const slugById = new Map([...companies].map(([slug, c]) => [c.id, slug]));
  const removed = existing
    .filter((l) => !links.companyIds.includes(l.companyId))
    .map((l) => slugById.get(l.companyId) ?? "a company");
  if (removed.length)
    r.warn("companies", `Unlinks ${removed.join(", ")} (not in the companies cell).`);
}

export function linksChanged(links: CompanyLinks, existing: readonly ExistingLink[]): boolean {
  if (!links) return false;
  const current = [...existing].sort((a, b) => a.companyId.localeCompare(b.companyId));
  if (current.map((l) => l.companyId).join() !== links.companyIds.join()) return true;
  if (!links.askedIn) return false;
  const wanted = links.askedIn.join();
  return current.some((l) => [...l.askedIn].sort().reverse().join() !== wanted);
}

/** Makes an item's company links match the file. */
export async function writeCompanyLinks(
  tx: Prisma.TransactionClient,
  item: Item,
  links: CompanyLinks,
) {
  if (!links) return;
  await tx.companyItem.deleteMany({ where: { ...item, companyId: { notIn: links.companyIds } } });
  const existing = new Set(
    (
      await tx.companyItem.findMany({
        where: { ...item, companyId: { in: links.companyIds } },
        select: { companyId: true },
      })
    ).map((l) => l.companyId),
  );
  const added = links.companyIds.filter((id) => !existing.has(id));
  if (added.length)
    await tx.companyItem.createMany({
      data: added.map((companyId) => ({ companyId, ...item, askedIn: links.askedIn ?? [] })),
    });
  if (links.askedIn && existing.size)
    await tx.companyItem.updateMany({
      where: { ...item, companyId: { in: [...existing] } },
      data: { askedIn: links.askedIn },
    });
}

/**
 * "Import for this company" (D-067): the file types whose rows are questions, problems or
 * interview questions, and the kind of item each one imports.
 */
export const COMPANY_IMPORT_KINDS: Partial<Record<ImportType, LinkKind>> = {
  MCQ: "question",
  CODING_BUNDLE: "problem",
  CODING_PROBLEMS: "problem",
  CODING_PACKAGE: "problem",
  DESIGN_QUESTIONS: "design",
};

/** Rows with an empty companies cell are written for the import's company. */
export function fillCompanyCells(rows: { cells: Record<string, string> }[], slug: string) {
  for (const row of rows) if (!row.cells.companies?.trim()) row.cells.companies = slug;
}
