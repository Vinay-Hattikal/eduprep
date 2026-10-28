// A company's hiring process in one file (D-054): one row per test section, with the round it
// belongs to. Interview rounds without sections get one row with the section columns blank.
// Round details are written once (on any row of the round); other rows of the round may leave
// them blank.
//
// For every company in the file, the file is the full process: rounds and sections missing from
// it are removed. A company's rows are imported together, so one bad row holds back that company.

import type { RoundType, SectionType } from "@/generated/prisma/enums";
import { CellReader } from "@/server/imports/cells";
import { PLATFORMS } from "@/server/imports/definitions/company-details";
import { toCsv, type ParsedRow } from "@/server/imports/parse";
import {
  finishRow,
  sameValues,
  type ColumnSpec,
  type DbReader,
  type ImportDefinition,
  type RowMessage,
  type ValidatedRow,
} from "@/server/imports/types";

export type SectionPlan = {
  order: number;
  name: string;
  type: SectionType;
  questionCount: number;
  minutes: number;
  negativeMarks: number;
  canGoBack: boolean;
  topicIds: string[];
};

export type RoundPlan = {
  order: number;
  name: string;
  type: RoundType;
  platform: string | null;
  durationMin: number | null;
  isElimination: boolean | null;
  description: string | null;
  sections: SectionPlan[];
};

export type CompanyPlan = { companyId: string; slug: string; rounds: RoundPlan[] };
export type ProcessValue = { plan: CompanyPlan };

export type ProcessContext = {
  companies: Map<string, { id: string }>;
  topics: Map<string, { id: string }>;
  /** Current rounds (with sections) per company id. */
  existing: Map<string, RoundPlan[]>;
};

const ROUND_TYPES: Record<string, RoundType> = {
  "online-test": "ONLINE_TEST",
  "coding-test": "CODING_TEST",
  "group-discussion": "GROUP_DISCUSSION",
  "technical-interview": "TECHNICAL_INTERVIEW",
  "hr-interview": "HR_INTERVIEW",
  "managerial-interview": "MANAGERIAL_INTERVIEW",
};
const SECTION_TYPES: Record<string, SectionType> = { mcq: "MCQ", coding: "CODING" };
const PLATFORM_CHOICES = Object.fromEntries(PLATFORMS.map((p) => [p, p])) as Record<string, string>;

const ROUND_DETAIL_COLUMNS = [
  "round_name",
  "round_type",
  "platform",
  "duration_min",
  "is_elimination",
  "round_description",
];
const SECTION_COLUMNS = [
  "section_order",
  "section_name",
  "section_type",
  "question_count",
  "minutes",
  "negative_marks",
  "can_go_back",
  "topics",
];

export const PROCESS_COLUMNS: ColumnSpec[] = [
  { name: "company", required: true },
  { name: "round_order", required: true },
  ...ROUND_DETAIL_COLUMNS.map((name) => ({ name, required: false })),
  ...SECTION_COLUMNS.map((name) => ({ name, required: false })),
];

type RoundDetails = Omit<RoundPlan, "order" | "sections">;

type ReadRow = {
  row: ParsedRow;
  r: CellReader;
  slug?: string;
  companyId?: string;
  roundOrder?: number;
  details?: RoundDetails;
  section?: SectionPlan;
};

function readRow(row: ParsedRow, ctx: ProcessContext): ReadRow {
  const r = new CellReader(row.cells);
  const slug = r.slug("company");
  const company = slug ? ctx.companies.get(slug) : undefined;
  if (slug && !company)
    r.error("company", `Unknown company "${slug}". Import companies.csv first.`);
  const roundOrder = r.int("round_order", { min: 1, max: 20 });

  let details: RoundDetails | undefined;
  if (r.optional("round_name") || r.optional("round_type")) {
    const name = r.required("round_name");
    const type = r.choice("round_type", ROUND_TYPES);
    const platform = r.choice("platform", PLATFORM_CHOICES, { required: false }) ?? null;
    const durationMin = r.int("duration_min", { required: false, min: 1, max: 600 }) ?? null;
    const isElimination = r.yesNo("is_elimination") ?? null;
    const description = r.markdown("round_description", { required: false }) ?? null;
    if (name && type) details = { name, type, platform, durationMin, isElimination, description };
  } else {
    for (const column of ["platform", "duration_min", "is_elimination", "round_description"])
      if (r.optional(column)) r.error(column, "Write the round details next to round_name.");
  }

  let section: SectionPlan | undefined;
  if (SECTION_COLUMNS.some((column) => r.optional(column))) {
    const order = r.int("section_order", { min: 1, max: 20 });
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
    if (order && name && type && questionCount && minutes)
      section = {
        order,
        name,
        type,
        questionCount,
        minutes,
        negativeMarks,
        canGoBack,
        topicIds: topicIds.sort(),
      };
  }
  return { row, r, slug, companyId: company?.id, roundOrder, details, section };
}

const roundLabel = (round: { order: number; name: string }) =>
  `round ${round.order} (${round.name})`;

export function validateProcessRows(
  rows: ParsedRow[],
  ctx: ProcessContext,
): ValidatedRow<ProcessValue>[] {
  const read = rows.map((row) => readRow(row, ctx));

  // Group rows by company, then by round.
  const byCompany = new Map<string, ReadRow[]>();
  for (const item of read) {
    if (!item.slug) continue;
    const list = byCompany.get(item.slug) ?? [];
    list.push(item);
    byCompany.set(item.slug, list);
  }

  const plans = new Map<string, CompanyPlan>();
  const extraMessages = new Map<ReadRow, RowMessage[]>();
  const actions = new Map<ReadRow, "CREATE" | "UPDATE" | "UNCHANGED">();

  for (const [slug, items] of byCompany) {
    const rounds = new Map<number, { details?: RoundDetails; from?: number; items: ReadRow[] }>();
    for (const item of items) {
      if (!item.roundOrder) continue;
      const round = rounds.get(item.roundOrder) ?? { items: [] };
      round.items.push(item);
      if (item.details) {
        if (!round.details) {
          round.details = item.details;
          round.from = item.row.rowNumber;
        } else if (!sameValues(round.details, item.details)) {
          item.r.error(
            "round_name",
            `Round ${item.roundOrder} details differ from row ${round.from}. Write them once, or the same way.`,
          );
        }
      }
      rounds.set(item.roundOrder, round);
    }

    const plan: CompanyPlan = { companyId: items[0]!.companyId ?? "", slug, rounds: [] };
    for (const [order, round] of [...rounds].sort(([a], [b]) => a - b)) {
      if (!round.details) {
        for (const item of round.items)
          item.r.error("round_name", `Round ${order} needs round_name and round_type on one row.`);
        continue;
      }
      const sections: SectionPlan[] = [];
      const seenSections = new Map<number, number>();
      for (const item of round.items) {
        if (!item.section) continue;
        const first = seenSections.get(item.section.order);
        if (first)
          item.r.error(
            "section_order",
            `Round ${order} already has section ${item.section.order} (row ${first}).`,
          );
        else {
          seenSections.set(item.section.order, item.row.rowNumber);
          sections.push(item.section);
        }
      }
      plan.rounds.push({
        order,
        ...round.details,
        sections: sections.sort((a, b) => a.order - b.order),
      });
    }

    // A company is imported as a whole.
    const failed = items.filter((item) => item.r.hasErrors || !item.companyId);
    if (failed.length) {
      const rowNumbers = failed.map((item) => item.row.rowNumber).join(", ");
      for (const item of items.filter((i) => !failed.includes(i)))
        item.r.error(
          undefined,
          `Not imported: ${slug} has errors in row ${rowNumbers}. A company's rounds are imported together.`,
        );
      continue;
    }
    plans.set(slug, plan);

    // What changes, per row, and what the file removes.
    const current = ctx.existing.get(plan.companyId) ?? [];
    for (const item of items) {
      const before = current.find((r) => r.order === item.roundOrder);
      const after = plan.rounds.find((r) => r.order === item.roundOrder)!;
      const { sections: _a, ...afterDetails } = after;
      if (!before) {
        actions.set(item, "CREATE");
        continue;
      }
      const { sections: beforeSections, ...beforeDetails } = before;
      const roundSame = sameValues(beforeDetails, afterDetails);
      const sectionBefore = item.section
        ? beforeSections.find((s) => s.order === item.section!.order)
        : undefined;
      if (item.section && !sectionBefore) actions.set(item, "CREATE");
      else if (roundSame && (!item.section || sameValues(sectionBefore, item.section)))
        actions.set(item, "UNCHANGED");
      else actions.set(item, "UPDATE");
    }
    const removed: string[] = [];
    for (const before of current) {
      const after = plan.rounds.find((r) => r.order === before.order);
      if (!after) {
        removed.push(roundLabel(before));
        continue;
      }
      for (const section of before.sections)
        if (!after.sections.some((s) => s.order === section.order))
          removed.push(`${roundLabel(before)} section ${section.order} (${section.name})`);
    }
    if (removed.length) {
      const first = items[0]!;
      extraMessages.set(first, [
        { level: "warning", message: `Removes what isn't in the file: ${removed.join(", ")}.` },
      ]);
      if (actions.get(first) === "UNCHANGED") actions.set(first, "UPDATE");
    }
  }

  return read.map((item) => {
    const plan = item.slug ? plans.get(item.slug) : undefined;
    const messages = [...item.r.messages, ...(extraMessages.get(item) ?? [])];
    if (!plan || item.r.hasErrors)
      return finishRow<ProcessValue>(item.row, messages, undefined, null);
    return finishRow(item.row, messages, { plan }, actions.get(item) ?? "UPDATE", plan.companyId);
  });
}

async function loadProcessContext(db: DbReader, rows: ParsedRow[]): Promise<ProcessContext> {
  const slugs = [
    ...new Set(rows.map((row) => row.cells.company?.trim()).filter(Boolean)),
  ] as string[];
  const [companies, topics] = await Promise.all([
    db.company.findMany({
      where: { slug: { in: slugs } },
      select: {
        id: true,
        slug: true,
        rounds: {
          orderBy: { order: "asc" },
          include: {
            sections: { orderBy: { order: "asc" }, include: { topics: { select: { id: true } } } },
          },
        },
      },
    }),
    db.topic.findMany({ select: { id: true, slug: true } }),
  ]);
  return {
    companies: new Map(companies.map((c) => [c.slug, { id: c.id }])),
    topics: new Map(topics.map((t) => [t.slug, { id: t.id }])),
    existing: new Map(
      companies.map((c) => [
        c.id,
        c.rounds.map((round) => ({
          order: round.order,
          name: round.name,
          type: round.type,
          platform: round.platform,
          durationMin: round.durationMin,
          isElimination: round.isElimination,
          description: round.description,
          sections: round.sections.map((s) => ({
            order: s.order,
            name: s.name,
            type: s.type,
            questionCount: s.questionCount,
            minutes: s.minutes,
            negativeMarks: s.negativeMarks,
            canGoBack: s.canGoBack,
            topicIds: s.topics.map((t) => t.id).sort(),
          })),
        })),
      ]),
    ),
  };
}

/** Every company's process in this file's format, for editing and re-uploading. */
export async function exportCompanyProcess(db: DbReader): Promise<string> {
  const companies = await db.company.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      rounds: {
        orderBy: { order: "asc" },
        include: {
          sections: { orderBy: { order: "asc" }, include: { topics: { select: { slug: true } } } },
        },
      },
    },
  });
  const lower = (value: string) => value.toLowerCase().replace(/_/g, "-");
  const rows: Record<string, string>[] = [];
  for (const company of companies) {
    for (const round of company.rounds) {
      const details = {
        round_name: round.name,
        round_type: lower(round.type),
        platform: round.platform ?? "",
        duration_min: round.durationMin?.toString() ?? "",
        is_elimination: round.isElimination === null ? "" : round.isElimination ? "yes" : "no",
        round_description: round.description ?? "",
      };
      const base = { company: company.slug, round_order: String(round.order) };
      if (round.sections.length === 0) rows.push({ ...base, ...details });
      round.sections.forEach((s, i) =>
        rows.push({
          ...base,
          ...(i === 0 ? details : {}),
          section_order: String(s.order),
          section_name: s.name,
          section_type: s.type.toLowerCase(),
          question_count: String(s.questionCount),
          minutes: String(s.minutes),
          negative_marks: String(s.negativeMarks),
          can_go_back: s.canGoBack ? "yes" : "no",
          topics: s.topics.map((t) => t.slug).join("|"),
        }),
      );
    }
  }
  return toCsv(
    PROCESS_COLUMNS.map((c) => c.name),
    rows,
  );
}

export const companyProcessImport: ImportDefinition<ProcessValue> = {
  type: "COMPANY_PROCESS",
  label: "Company rounds and sections",
  description:
    "One row per test section, with its round. Interview rounds get one row with the section columns blank. Replaces each listed company's rounds.",
  permission: "companies.manage",
  template: "companies/company-process.csv",
  allowZip: false,
  columns: PROCESS_COLUMNS,
  commitChunkSize: Number.MAX_SAFE_INTEGER, // each company's rounds change together

  async validate(rows, _file, db) {
    return validateProcessRows(rows, await loadProcessContext(db, rows));
  },

  async commit(rows, { tx }) {
    const done = new Set<string>();
    for (const row of rows) {
      const { plan } = row.value!;
      if (done.has(plan.companyId)) continue;
      done.add(plan.companyId);
      await tx.companyRound.deleteMany({
        where: { companyId: plan.companyId, order: { notIn: plan.rounds.map((r) => r.order) } },
      });
      for (const { sections, ...round } of plan.rounds) {
        const saved = await tx.companyRound.upsert({
          where: { companyId_order: { companyId: plan.companyId, order: round.order } },
          create: { companyId: plan.companyId, ...round },
          update: round,
        });
        await tx.companySection.deleteMany({
          where: { roundId: saved.id, order: { notIn: sections.map((s) => s.order) } },
        });
        for (const { topicIds, ...section } of sections) {
          const topics = topicIds.map((id) => ({ id }));
          await tx.companySection.upsert({
            where: { roundId_order: { roundId: saved.id, order: section.order } },
            create: { roundId: saved.id, ...section, topics: { connect: topics } },
            update: { ...section, topics: { set: topics } },
          });
        }
      }
    }
    return rows.map((row) => ({
      rowNumber: row.rowNumber,
      entityId: row.value!.plan.companyId,
      action: row.action!,
    }));
  },
};
