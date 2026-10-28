// Company rounds, sections, sources and the question map (data-import.md 4.5, 4.6).
// Each file adds or updates rows; it never deletes rows missing from the file.

import type { RoundType, SectionType } from "@/generated/prisma/enums";
import { CellReader } from "@/server/imports/cells";
import { todayUtc } from "@/server/imports/definitions/companies";
import type { ParsedRow } from "@/server/imports/parse";
import {
  finishRow,
  sameValues,
  type DbReader,
  type ImportDefinition,
  type ValidatedRow,
} from "@/server/imports/types";

// ---------- shared ----------

type CompanyRef = Map<string, { id: string }>;

async function loadCompanies(db: DbReader, rows: ParsedRow[]): Promise<CompanyRef> {
  const slugs = [
    ...new Set(rows.map((row) => row.cells.company?.trim()).filter(Boolean) as string[]),
  ];
  const companies = await db.company.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  return new Map(companies.map((c) => [c.slug, { id: c.id }]));
}

function readCompany(r: CellReader, companies: CompanyRef) {
  const slug = r.slug("company");
  const company = slug ? companies.get(slug) : undefined;
  if (slug && !company)
    r.error("company", `Unknown company "${slug}". Import companies.csv first.`);
  return { slug, company };
}

function duplicateCheck(
  seen: Map<string, number>,
  key: string,
  r: CellReader,
  column: string,
  rowNumber: number,
) {
  const first = seen.get(key);
  if (first) r.error(column, `Same entry as row ${first}.`);
  else seen.set(key, rowNumber);
}

// ---------- rounds ----------

export type RoundValue = {
  companyId: string;
  order: number;
  name: string;
  type: RoundType;
  platform: string | null;
  durationMin: number | null;
  isElimination: boolean | null;
  description: string | null;
};

const ROUND_TYPES: Record<string, RoundType> = {
  "online-test": "ONLINE_TEST",
  "coding-test": "CODING_TEST",
  "group-discussion": "GROUP_DISCUSSION",
  "technical-interview": "TECHNICAL_INTERVIEW",
  "hr-interview": "HR_INTERVIEW",
  "managerial-interview": "MANAGERIAL_INTERVIEW",
};

export const PLATFORMS = [
  "tcs-ion",
  "hackerrank",
  "amcat",
  "mettl",
  "cocubes",
  "hackerearth",
  "other",
] as const;
const PLATFORM_CHOICES = Object.fromEntries(PLATFORMS.map((p) => [p, p])) as Record<string, string>;

export type RoundContext = {
  companies: CompanyRef;
  existing: Map<string, RoundValue & { id: string }>;
};

export function validateRoundRows(
  rows: ParsedRow[],
  ctx: RoundContext,
): ValidatedRow<RoundValue>[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const r = new CellReader(row.cells);
    const { slug, company } = readCompany(r, ctx.companies);
    const order = r.int("round_order", { min: 1, max: 20 });
    if (slug && order) duplicateCheck(seen, `${slug}/${order}`, r, "round_order", row.rowNumber);
    const name = r.required("round_name");
    const type = r.choice("round_type", ROUND_TYPES);
    const platform = r.choice("platform", PLATFORM_CHOICES, { required: false }) ?? null;
    const durationMin = r.int("duration_min", { required: false, min: 1, max: 600 }) ?? null;
    const isElimination = r.yesNo("is_elimination") ?? null;
    const description = r.markdown("description", { required: false }) ?? null;

    if (r.hasErrors || !company || !order || !name || !type)
      return finishRow<RoundValue>(row, r.messages, undefined, null);
    const value: RoundValue = {
      companyId: company.id,
      order,
      name,
      type,
      platform,
      durationMin,
      isElimination,
      description,
    };
    const existing = ctx.existing.get(`${company.id}/${order}`);
    const { id: _id, ...existingValue } = existing ?? { id: "" };
    const action = !existing ? "CREATE" : sameValues(existingValue, value) ? "UNCHANGED" : "UPDATE";
    return finishRow(row, r.messages, value, action, existing?.id);
  });
}

export const companyRoundImport: ImportDefinition<RoundValue> = {
  type: "COMPANY_ROUNDS",
  label: "Company rounds",
  description: "Each company's hiring rounds, in order.",
  permission: "companies.manage",
  template: "companies/company-rounds.csv",
  allowZip: false,
  legacy: true,
  columns: [
    { name: "company", required: true },
    { name: "round_order", required: true },
    { name: "round_name", required: true },
    { name: "round_type", required: true },
    { name: "platform", required: false },
    { name: "duration_min", required: false },
    { name: "is_elimination", required: false },
    { name: "description", required: false },
  ],
  async validate(rows, _file, db) {
    const companies = await loadCompanies(db, rows);
    const existing = await db.companyRound.findMany({
      where: { companyId: { in: [...companies.values()].map((c) => c.id) } },
    });
    return validateRoundRows(rows, {
      companies,
      existing: new Map(existing.map((round) => [`${round.companyId}/${round.order}`, round])),
    });
  },
  async commit(rows, { tx }) {
    const outcomes = [];
    for (const row of rows) {
      const value = row.value!;
      const record = await tx.companyRound.upsert({
        where: { companyId_order: { companyId: value.companyId, order: value.order } },
        create: value,
        update: value,
      });
      outcomes.push({ rowNumber: row.rowNumber, entityId: record.id, action: row.action! });
    }
    return outcomes;
  },
};

// ---------- sections ----------

export type SectionValue = {
  roundId: string;
  order: number;
  name: string;
  type: SectionType;
  questionCount: number;
  minutes: number;
  negativeMarks: number;
  canGoBack: boolean;
  topicIds: string[];
};

export type SectionContext = {
  companies: CompanyRef;
  /** Key: `${companySlug}/${roundOrder}` */
  rounds: Map<string, { id: string }>;
  topics: Map<string, { id: string }>;
  /** Key: `${roundId}/${sectionOrder}` */
  existing: Map<string, SectionValue & { id: string }>;
};

const SECTION_TYPES: Record<string, SectionType> = { mcq: "MCQ", coding: "CODING" };

export function validateSectionRows(
  rows: ParsedRow[],
  ctx: SectionContext,
): ValidatedRow<SectionValue>[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const r = new CellReader(row.cells);
    const { slug, company } = readCompany(r, ctx.companies);
    const roundOrder = r.int("round_order", { min: 1, max: 20 });
    const round = slug && roundOrder ? ctx.rounds.get(`${slug}/${roundOrder}`) : undefined;
    if (company && roundOrder && !round)
      r.error(
        "round_order",
        `${slug} has no round ${roundOrder}. Import company-rounds.csv first.`,
      );
    const order = r.int("section_order", { min: 1, max: 20 });
    if (slug && roundOrder && order)
      duplicateCheck(seen, `${slug}/${roundOrder}/${order}`, r, "section_order", row.rowNumber);
    const name = r.required("section_name");
    const type = r.choice("section_type", SECTION_TYPES);
    const questionCount = r.int("question_count", { min: 1, max: 500 });
    const minutes = r.int("minutes", { min: 1, max: 600 });
    const negativeMarks = r.float("negative_marks", { required: false, min: 0, max: 10 }) ?? 0;
    const canGoBack = r.yesNo("can_go_back") ?? true;

    const topicIds: string[] = [];
    const topicSlugs = r.list("topics");
    if (topicSlugs.length === 0) r.error("topics", "List at least one topic slug.");
    for (const topicSlug of topicSlugs) {
      const topic = ctx.topics.get(topicSlug);
      if (!topic) r.error("topics", `Unknown topic "${topicSlug}".`);
      else if (!topicIds.includes(topic.id)) topicIds.push(topic.id);
    }

    if (r.hasErrors || !round || !order || !name || !type || !questionCount || !minutes) {
      return finishRow<SectionValue>(row, r.messages, undefined, null);
    }
    const value: SectionValue = {
      roundId: round.id,
      order,
      name,
      type,
      questionCount,
      minutes,
      negativeMarks,
      canGoBack,
      topicIds,
    };
    const existing = ctx.existing.get(`${round.id}/${order}`);
    let action: "CREATE" | "UPDATE" | "UNCHANGED" = "CREATE";
    if (existing) {
      const { id: _id, ...existingValue } = existing;
      const sortTopics = (v: SectionValue) => ({ ...v, topicIds: [...v.topicIds].sort() });
      action = sameValues(sortTopics(existingValue), sortTopics(value)) ? "UNCHANGED" : "UPDATE";
    }
    return finishRow(row, r.messages, value, action, existing?.id);
  });
}

export const companySectionImport: ImportDefinition<SectionValue> = {
  type: "COMPANY_SECTIONS",
  label: "Company test sections",
  description: "Sections inside test rounds. Mock tests are built from these.",
  permission: "companies.manage",
  template: "companies/company-sections.csv",
  allowZip: false,
  legacy: true,
  columns: [
    { name: "company", required: true },
    { name: "round_order", required: true },
    { name: "section_order", required: true },
    { name: "section_name", required: true },
    { name: "section_type", required: true },
    { name: "question_count", required: true },
    { name: "minutes", required: true },
    { name: "negative_marks", required: false },
    { name: "can_go_back", required: false },
    { name: "topics", required: true },
  ],
  async validate(rows, _file, db) {
    const companies = await loadCompanies(db, rows);
    const [rounds, topics] = await Promise.all([
      db.companyRound.findMany({
        where: { companyId: { in: [...companies.values()].map((c) => c.id) } },
        include: {
          company: { select: { slug: true } },
          sections: { include: { topics: { select: { id: true } } } },
        },
      }),
      db.topic.findMany({ select: { id: true, slug: true } }),
    ]);
    const existing = new Map<string, SectionValue & { id: string }>();
    for (const round of rounds) {
      for (const section of round.sections) {
        const { topics: sectionTopics, ...rest } = section;
        existing.set(`${round.id}/${section.order}`, {
          ...rest,
          topicIds: sectionTopics.map((t) => t.id),
        });
      }
    }
    return validateSectionRows(rows, {
      companies,
      rounds: new Map(
        rounds.map((round) => [`${round.company.slug}/${round.order}`, { id: round.id }]),
      ),
      topics: new Map(topics.map((t) => [t.slug, { id: t.id }])),
      existing,
    });
  },
  async commit(rows, { tx }) {
    const outcomes = [];
    for (const row of rows) {
      const { topicIds, ...value } = row.value!;
      const topics = topicIds.map((id) => ({ id }));
      const record = await tx.companySection.upsert({
        where: { roundId_order: { roundId: value.roundId, order: value.order } },
        create: { ...value, topics: { connect: topics } },
        update: { ...value, topics: { set: topics } },
      });
      outcomes.push({ rowNumber: row.rowNumber, entityId: record.id, action: row.action! });
    }
    return outcomes;
  },
};

// ---------- sources ----------

export type SourceValue = { companyId: string; label: string; url: string; checkedOn: Date };

export type SourceContext = {
  companies: CompanyRef;
  /** Key: `${companyId}/${url}` */
  existing: Map<string, SourceValue & { id: string }>;
  today: Date;
};

export function validateSourceRows(
  rows: ParsedRow[],
  ctx: SourceContext,
): ValidatedRow<SourceValue>[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const r = new CellReader(row.cells);
    const { slug, company } = readCompany(r, ctx.companies);
    const label = r.required("label");
    const url = r.url("url");
    if (slug && url) duplicateCheck(seen, `${slug}/${url}`, r, "url", row.rowNumber);
    const checkedOn = r.date("checked_on");
    if (checkedOn && checkedOn > ctx.today) r.error("checked_on", "Can't be in the future.");
    if (r.hasErrors || !company || !label || !url || !checkedOn)
      return finishRow<SourceValue>(row, r.messages, undefined, null);

    const value = { companyId: company.id, label, url, checkedOn };
    const existing = ctx.existing.get(`${company.id}/${url}`);
    const { id: _id, ...existingValue } = existing ?? { id: "" };
    const action = !existing ? "CREATE" : sameValues(existingValue, value) ? "UNCHANGED" : "UPDATE";
    return finishRow(row, r.messages, value, action, existing?.id);
  });
}

export const companySourceImport: ImportDefinition<SourceValue> = {
  type: "COMPANY_SOURCES",
  label: "Company sources",
  description: "Where each company fact comes from. Every company needs at least one.",
  permission: "companies.manage",
  template: "companies/company-sources.csv",
  allowZip: false,
  legacy: true,
  columns: [
    { name: "company", required: true },
    { name: "label", required: true },
    { name: "url", required: true },
    { name: "checked_on", required: true },
  ],
  async validate(rows, _file, db) {
    const companies = await loadCompanies(db, rows);
    const existing = await db.companySource.findMany({
      where: { companyId: { in: [...companies.values()].map((c) => c.id) } },
    });
    return validateSourceRows(rows, {
      companies,
      existing: new Map(existing.map((s) => [`${s.companyId}/${s.url}`, s])),
      today: todayUtc(),
    });
  },
  async commit(rows, { tx }) {
    const outcomes = [];
    for (const row of rows) {
      const value = row.value!;
      const record = await tx.companySource.upsert({
        where: { companyId_url: { companyId: value.companyId, url: value.url } },
        create: value,
        update: value,
      });
      outcomes.push({ rowNumber: row.rowNumber, entityId: record.id, action: row.action! });
    }
    return outcomes;
  },
};

// ---------- question map ----------

export type MapValue = {
  companyId: string;
  /** Exactly one of questionId (MCQ) and problemId (coding) is set. */
  questionId: string | null;
  problemId: string | null;
  roundOrder: number | null;
  askedIn: string[];
  reportCount: number;
};

export type MapContext = {
  companies: CompanyRef;
  questions: Map<string, { id: string }>;
  problems: Map<string, { id: string }>;
  /** Key: `${companySlug}/${roundOrder}` */
  rounds: Set<string>;
  /** Key: `${companyId}/${questionId ?? problemId}` */
  existing: Map<string, MapValue & { id: string }>;
  today: Date;
};

const ITEM_TYPES: Record<string, "mcq" | "coding"> = { mcq: "mcq", coding: "coding" };

export function validateMapRows(rows: ParsedRow[], ctx: MapContext): ValidatedRow<MapValue>[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const r = new CellReader(row.cells);
    const { slug, company } = readCompany(r, ctx.companies);
    const itemType = r.choice("item_type", ITEM_TYPES);
    const itemId = r.required("item_id");
    const item =
      itemId && itemType
        ? (itemType === "mcq" ? ctx.questions : ctx.problems).get(itemId)
        : undefined;
    if (itemType && itemId && !item)
      r.error(
        "item_id",
        itemType === "mcq"
          ? `No question with ID "${itemId}". Import it first.`
          : `No coding problem with ID "${itemId}". Import it first.`,
      );
    if (slug && itemId) duplicateCheck(seen, `${slug}/${itemId}`, r, "item_id", row.rowNumber);

    const roundOrder = r.int("round_order", { required: false, min: 1, max: 20 }) ?? null;
    if (slug && company && roundOrder && !ctx.rounds.has(`${slug}/${roundOrder}`))
      r.warn("round_order", `${slug} has no round ${roundOrder} yet.`);
    const askedIn = r.months("asked_in", ctx.today);
    const reportCount = r.int("report_count", { required: false, min: 0, max: 100_000 }) ?? 0;

    if (r.hasErrors || !company || !item || !itemType)
      return finishRow<MapValue>(row, r.messages, undefined, null);
    const value: MapValue = {
      companyId: company.id,
      questionId: itemType === "mcq" ? item.id : null,
      problemId: itemType === "coding" ? item.id : null,
      roundOrder,
      askedIn,
      reportCount,
    };
    const existing = ctx.existing.get(`${company.id}/${item.id}`);
    const { id: _id, ...existingValue } = existing ?? { id: "" };
    const action = !existing ? "CREATE" : sameValues(existingValue, value) ? "UNCHANGED" : "UPDATE";
    return finishRow(row, r.messages, value, action, existing?.id);
  });
}

export const companyQuestionMapImport: ImportDefinition<MapValue> = {
  type: "COMPANY_QUESTION_MAP",
  label: "Company question map",
  description:
    "Links existing questions and coding problems to companies. One item can be linked to many companies.",
  permission: "companies.manage",
  template: "companies/company-question-map.csv",
  allowZip: false,
  legacy: true,
  columns: [
    { name: "company", required: true },
    { name: "item_type", required: true },
    { name: "item_id", required: true },
    { name: "round_order", required: false },
    { name: "asked_in", required: false },
    { name: "report_count", required: false },
  ],
  async validate(rows, _file, db) {
    const companies = await loadCompanies(db, rows);
    const companyIds = [...companies.values()].map((c) => c.id);
    const itemIds = rows.map((row) => row.cells.item_id?.trim()).filter(Boolean) as string[];
    const [questions, problems, rounds, existing] = await Promise.all([
      db.question.findMany({
        where: { externalId: { in: itemIds } },
        select: { id: true, externalId: true },
      }),
      db.problem.findMany({
        where: { externalId: { in: itemIds } },
        select: { id: true, externalId: true },
      }),
      db.companyRound.findMany({
        where: { companyId: { in: companyIds } },
        select: { order: true, company: { select: { slug: true } } },
      }),
      db.companyItem.findMany({ where: { companyId: { in: companyIds } } }),
    ]);
    return validateMapRows(rows, {
      companies,
      questions: new Map(questions.map((q) => [q.externalId, { id: q.id }])),
      problems: new Map(problems.map((p) => [p.externalId, { id: p.id }])),
      rounds: new Set(rounds.map((round) => `${round.company.slug}/${round.order}`)),
      existing: new Map(
        existing.map((item) => [`${item.companyId}/${item.questionId ?? item.problemId}`, item]),
      ),
      today: todayUtc(),
    });
  },
  async commit(rows, { tx }) {
    const outcomes = [];
    for (const row of rows) {
      const value = row.value!;
      const record = await tx.companyItem.upsert({
        where: value.questionId
          ? { companyId_questionId: { companyId: value.companyId, questionId: value.questionId } }
          : { companyId_problemId: { companyId: value.companyId, problemId: value.problemId! } },
        create: value,
        update: value,
      });
      outcomes.push({ rowNumber: row.rowNumber, entityId: record.id, action: row.action! });
    }
    return outcomes;
  },
};
