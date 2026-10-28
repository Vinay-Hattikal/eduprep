// Company profile import (data-import.md 4.5, companies.csv).

import type { Prisma } from "@/generated/prisma/client";
import type { CompanyCategory, CompanyLevel, ProfileType } from "@/generated/prisma/enums";
import { CellReader } from "@/server/imports/cells";
import { toCsv, type ParsedRow } from "@/server/imports/parse";
import {
  finishRow,
  sameValues,
  type DbReader,
  type ImportDefinition,
  type ValidatedRow,
} from "@/server/imports/types";

export type CompanyValue = {
  slug: string;
  name: string;
  level: CompanyLevel;
  category: CompanyCategory;
  hiringFor: ProfileType[];
  overview: string;
  website: string | null;
  careersUrl: string | null;
  ctcFresher: string | null;
  ctcExperienced: string | null;
  minCgpa: number | null;
  min10thPercent: number | null;
  min12thPercent: number | null;
  maxBacklogs: number | null;
  maxGapYears: number | null;
  branches: string[];
  gradYears: number[];
  lastVerifiedAt: Date;
  /** From the source_N columns; null when the file has none (sources are left alone). */
  sources: CompanySourceValue[] | null;
};

export type CompanySourceValue = { label: string; url: string; checkedOn: Date };

type ExistingCompany = Omit<CompanyValue, "sources"> & { id: string; status?: string };

export type CompanyContext = {
  existing: Map<string, ExistingCompany>;
  today: Date;
  /** Current sources per company slug (needed when the file has source columns). */
  sources?: Map<string, CompanySourceValue[]>;
  /** Whether the file has source_N columns. */
  sourceColumns?: boolean;
};

/** Up to three sources per company in companies.csv itself (D-054). */
export const COMPANY_SOURCE_SLOTS = 3;
const SOURCE_COLUMNS = Array.from({ length: COMPANY_SOURCE_SLOTS }, (_, i) =>
  ["label", "url", "checked_on"].map((part) => `source_${i + 1}_${part}`),
).flat();

function readSources(r: CellReader, today: Date): CompanySourceValue[] {
  const sources: CompanySourceValue[] = [];
  for (let i = 1; i <= COMPANY_SOURCE_SLOTS; i++) {
    const prefix = `source_${i}`;
    if (!["label", "url", "checked_on"].some((part) => r.optional(`${prefix}_${part}`))) continue;
    const label = r.required(`${prefix}_label`);
    const url = r.url(`${prefix}_url`);
    const checkedOn = r.date(`${prefix}_checked_on`);
    if (checkedOn && checkedOn > today) r.error(`${prefix}_checked_on`, "Can't be in the future.");
    if (url && sources.some((s) => s.url === url))
      r.error(`${prefix}_url`, "Same link as another source.");
    else if (label && url && checkedOn) sources.push({ label, url, checkedOn });
  }
  if (sources.length === 0 && !r.hasErrors)
    r.error("source_1_url", "Every company needs at least one source (label, link, date checked).");
  return sources.sort((a, b) => a.url.localeCompare(b.url));
}

const LEVELS: Record<string, CompanyLevel> = {
  full: "FULL",
  standard: "STANDARD",
  generic: "GENERIC",
};
const CATEGORIES: Record<string, CompanyCategory> = {
  service: "SERVICE",
  product: "PRODUCT",
  consulting: "CONSULTING",
  startup: "STARTUP",
  other: "OTHER",
};
const HIRING: Record<string, ProfileType> = { fresher: "FRESHER", experienced: "EXPERIENCED" };

const COMPARED_FIELDS = [
  "name",
  "level",
  "category",
  "hiringFor",
  "overview",
  "website",
  "careersUrl",
  "ctcFresher",
  "ctcExperienced",
  "minCgpa",
  "min10thPercent",
  "min12thPercent",
  "maxBacklogs",
  "maxGapYears",
  "branches",
  "gradYears",
  "lastVerifiedAt",
] as const;

function comparable(company: Omit<CompanyValue, "sources">) {
  return Object.fromEntries(COMPARED_FIELDS.map((field) => [field, company[field]]));
}

export function validateCompanyRows(
  rows: ParsedRow[],
  ctx: CompanyContext,
): ValidatedRow<CompanyValue>[] {
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const r = new CellReader(row.cells);
    const slug = r.slug("slug");
    if (slug) {
      const first = seen.get(slug);
      if (first) r.error("slug", `Same company as row ${first}.`);
      else seen.set(slug, row.rowNumber);
    }
    const name = r.required("name");
    const level = r.choice("level", LEVELS);
    const category = r.choice("category", CATEGORIES);

    const hiringFor: ProfileType[] = [];
    for (const item of r.list("hiring_for")) {
      const value = HIRING[item.toLowerCase()];
      if (!value) r.error("hiring_for", `"${item}" isn't allowed. Use fresher and/or experienced.`);
      else if (!hiringFor.includes(value)) hiringFor.push(value);
    }
    if (hiringFor.length === 0 && !r.messages.some((m) => m.column === "hiring_for"))
      r.error("hiring_for", "Required: fresher, experienced or fresher|experienced.");

    const overview = r.markdown("overview");
    const website = r.url("website", { required: false }) ?? null;
    const careersUrl = r.url("careers_url", { required: false }) ?? null;
    const ctcFresher = r.optional("ctc_fresher") ?? null;
    const ctcExperienced = r.optional("ctc_experienced") ?? null;
    const minCgpa = r.float("min_cgpa", { required: false, min: 0, max: 10 }) ?? null;
    const min10thPercent = r.int("min_10th_percent", { required: false, min: 0, max: 100 }) ?? null;
    const min12thPercent = r.int("min_12th_percent", { required: false, min: 0, max: 100 }) ?? null;
    const maxBacklogs = r.int("max_backlogs", { required: false, min: 0, max: 50 }) ?? null;
    const maxGapYears = r.int("max_gap_years", { required: false, min: 0, max: 20 }) ?? null;

    const branchList = r.list("branches").map((b) => b.toUpperCase());
    const branches = branchList.includes("ANY") ? [] : [...new Set(branchList)];

    const gradYears: number[] = [];
    for (const item of r.list("grad_years")) {
      const year = Number(item);
      if (!/^\d{4}$/.test(item) || year < 2000 || year > 2100)
        r.error("grad_years", `"${item}" isn't a valid year.`);
      else if (!gradYears.includes(year)) gradYears.push(year);
    }

    const lastVerifiedAt = r.date("last_verified");
    if (lastVerifiedAt && lastVerifiedAt > ctx.today)
      r.error("last_verified", "Can't be in the future.");
    const sources = ctx.sourceColumns ? readSources(r, ctx.today) : null;

    if (r.hasErrors || !slug || !name || !level || !category || !overview || !lastVerifiedAt) {
      return finishRow<CompanyValue>(row, r.messages, undefined, null);
    }

    const value: CompanyValue = {
      slug,
      name,
      level,
      category,
      hiringFor,
      overview,
      website,
      careersUrl,
      ctcFresher,
      ctcExperienced,
      minCgpa,
      min10thPercent,
      min12thPercent,
      maxBacklogs,
      maxGapYears,
      branches,
      gradYears: gradYears.sort(),
      lastVerifiedAt,
      sources,
    };
    const existing = ctx.existing.get(slug);
    const sourcesSame =
      !sources || sameValues(sources, [...(ctx.sources?.get(slug) ?? [])].sort(byUrl));
    if (existing?.status === "ARCHIVED")
      r.warn(undefined, "This company is archived. Importing brings it back as a draft.");
    const action = !existing
      ? "CREATE"
      : sameValues(comparable(existing), comparable(value)) &&
          sourcesSame &&
          existing.status !== "ARCHIVED"
        ? "UNCHANGED"
        : "UPDATE";
    return finishRow(row, r.messages, value, action, existing?.id);
  });
}

const byUrl = (a: CompanySourceValue, b: CompanySourceValue) => a.url.localeCompare(b.url);

const COMPANY_COLUMNS = [
  "slug",
  "name",
  "level",
  "category",
  "hiring_for",
  "overview",
  "last_verified",
]
  .map((name) => ({ name, required: true }))
  .concat(
    [
      "website",
      "careers_url",
      "ctc_fresher",
      "ctc_experienced",
      "min_cgpa",
      "min_10th_percent",
      "min_12th_percent",
      "max_backlogs",
      "max_gap_years",
      "branches",
      "grad_years",
      ...SOURCE_COLUMNS,
    ].map((name) => ({ name, required: false })),
  );

export function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export const companyImport: ImportDefinition<CompanyValue> = {
  type: "COMPANIES",
  label: "Companies (profiles and sources)",
  description:
    "One row per company: profile, eligibility and up to three sources. Then import rounds and sections.",
  permission: "companies.manage",
  template: "companies/companies.csv",
  allowZip: false,
  columns: COMPANY_COLUMNS,

  async validate(rows, file, db: DbReader) {
    const slugs = rows.map((row) => row.cells.slug?.trim()).filter(Boolean) as string[];
    const existing = await db.company.findMany({
      where: { slug: { in: slugs } },
      include: { sources: { select: { label: true, url: true, checkedOn: true } } },
    });
    return validateCompanyRows(rows, {
      existing: new Map(existing.map(({ sources: _s, ...c }) => [c.slug, c])),
      sources: new Map(existing.map((c) => [c.slug, c.sources])),
      sourceColumns: file.headers.some((h) => h.startsWith("source_")),
      today: todayUtc(),
    });
  },

  async commit(rows, { tx }) {
    const outcomes = [];
    for (const row of rows) {
      const { sources, ...value } = row.value!;
      const before = await tx.company.findUnique({ where: { slug: value.slug } });
      // Imports never publish: a changed company goes back to draft for review (D-010).
      const record = before
        ? await tx.company.update({ where: { id: before.id }, data: { ...value, status: "DRAFT" } })
        : await tx.company.create({ data: { ...value, status: "DRAFT" } });
      if (sources) {
        await tx.companySource.deleteMany({
          where: { companyId: record.id, url: { notIn: sources.map((s) => s.url) } },
        });
        for (const source of sources)
          await tx.companySource.upsert({
            where: { companyId_url: { companyId: record.id, url: source.url } },
            create: { companyId: record.id, ...source },
            update: source,
          });
      }
      outcomes.push({
        rowNumber: row.rowNumber,
        entityId: record.id,
        action: before ? ("UPDATE" as const) : ("CREATE" as const),
        previous: before
          ? (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue)
          : undefined,
      });
    }
    return outcomes;
  },

  replace: {
    scope: () => "every company",
    async missing(file, db) {
      const inFile = new Set(file.rows.map((row) => row.cells.slug?.trim()));
      const companies = await db.company.findMany({
        where: { status: { not: "ARCHIVED" } },
        select: { id: true, slug: true, name: true },
        orderBy: { slug: "asc" },
      });
      return companies
        .filter((c) => !inFile.has(c.slug))
        .map((c) => ({ id: c.id, label: `${c.slug} · ${c.name}` }));
    },
    async archive(ids, tx) {
      await tx.company.updateMany({ where: { id: { in: ids } }, data: { status: "ARCHIVED" } });
    },
    async backup(_file, db) {
      return { fileName: "companies-backup.csv", csv: await exportCompanies(db) };
    },
  },
};

/** Every company that isn't archived, in companies.csv format (with sources). */
export async function exportCompanies(db: DbReader): Promise<string> {
  const companies = await db.company.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { slug: "asc" },
    include: { sources: { orderBy: { url: "asc" } } },
  });
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const text = (value: number | string | null) => (value === null ? "" : String(value));
  const rows = companies.map((c) => {
    const row: Record<string, string> = {
      slug: c.slug,
      name: c.name,
      level: c.level.toLowerCase(),
      category: c.category.toLowerCase(),
      hiring_for: c.hiringFor.map((h) => h.toLowerCase()).join("|"),
      overview: c.overview,
      last_verified: c.lastVerifiedAt ? day(c.lastVerifiedAt) : "",
      website: text(c.website),
      careers_url: text(c.careersUrl),
      ctc_fresher: text(c.ctcFresher),
      ctc_experienced: text(c.ctcExperienced),
      min_cgpa: text(c.minCgpa),
      min_10th_percent: text(c.min10thPercent),
      min_12th_percent: text(c.min12thPercent),
      max_backlogs: text(c.maxBacklogs),
      max_gap_years: text(c.maxGapYears),
      branches: c.branches.length ? c.branches.join("|") : "ANY",
      grad_years: c.gradYears.join("|"),
    };
    c.sources.slice(0, COMPANY_SOURCE_SLOTS).forEach((s, i) => {
      row[`source_${i + 1}_label`] = s.label;
      row[`source_${i + 1}_url`] = s.url;
      row[`source_${i + 1}_checked_on`] = day(s.checkedOn);
    });
    return row;
  });
  return toCsv(
    COMPANY_COLUMNS.map((c) => c.name),
    rows,
  );
}
