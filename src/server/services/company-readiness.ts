import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { ContentStatus, RoundType, SectionType } from "@/generated/prisma/enums";
import {
  coverageNeeds,
  nextStep,
  readinessChecklist,
  type Coverage,
} from "@/lib/content/company-readiness";
import { isStale } from "@/lib/content/companies";
import { DRAFT_STATUSES } from "@/lib/content/workflow";
import { db } from "@/server/db";
import { questionPool } from "@/server/services/blueprints";

// The company checklist (D-067): the Overview tab for one company, the companies list for all.
// The same counts either way: a few grouped queries, whatever the number of companies.

type ReadinessCompany = {
  id: string;
  status: ContentStatus;
  overview: string;
  hiringFor: readonly string[];
  lastVerifiedAt: Date;
  sources: number;
  rounds: readonly {
    type: RoundType;
    sections: readonly {
      type: SectionType;
      questionCount: number;
      topics: readonly { id: string; name: string }[];
    }[];
  }[];
};

type StatusRow = { companyId: string; status: ContentStatus; checked?: boolean; n: number };

/** Linked questions, problems and interview questions per company and status. */
async function linkedCounts(ids: string[]) {
  const [questions, problems, interviews, mocks] = await Promise.all([
    db.$queryRaw<StatusRow[]>`
      SELECT ci.company_id AS "companyId", q.status, count(*)::int AS n
        FROM company_items ci JOIN questions q ON q.id = ci.question_id
       WHERE ci.company_id = ANY(${ids}) AND q.status <> 'ARCHIVED'
       GROUP BY 1, 2`,
    db.$queryRaw<StatusRow[]>`
      SELECT ci.company_id AS "companyId", p.status, p.validated_at IS NOT NULL AS checked,
             count(*)::int AS n
        FROM company_items ci JOIN problems p ON p.id = ci.problem_id
       WHERE ci.company_id = ANY(${ids}) AND p.status <> 'ARCHIVED'
       GROUP BY 1, 2, 3`,
    db.$queryRaw<StatusRow[]>`
      SELECT ci.company_id AS "companyId", d.status, count(*)::int AS n
        FROM company_items ci JOIN design_questions d ON d.id = ci.design_question_id
       WHERE ci.company_id = ANY(${ids}) AND d.status <> 'ARCHIVED'
       GROUP BY 1, 2`,
    db.testBlueprint.groupBy({
      by: ["companyId", "status"],
      where: { companyId: { in: ids }, kind: "COMPANY_MOCK", status: { not: "ARCHIVED" } },
      _count: { _all: true },
    }),
  ]);
  const byStatus = (rows: StatusRow[], companyId: string) => {
    const mine = rows.filter((r) => r.companyId === companyId);
    return {
      published: mine.filter((r) => r.status === "PUBLISHED").reduce((n, r) => n + r.n, 0),
      draft: mine
        .filter((r) => (DRAFT_STATUSES as readonly string[]).includes(r.status))
        .reduce((n, r) => n + r.n, 0),
      checked: mine
        .filter((r) => r.status !== "PUBLISHED" && r.checked)
        .reduce((n, r) => n + r.n, 0),
    };
  };
  const mockRows = mocks.map((m) => ({
    companyId: m.companyId!,
    status: m.status,
    n: m._count._all,
  }));
  return (companyId: string) => ({
    questions: byStatus(questions, companyId),
    problems: byStatus(problems, companyId),
    interviews: byStatus(interviews, companyId),
    mocks: byStatus(mockRows, companyId),
  });
}

/**
 * Published items in every topic the companies' mocks need: one grouped count for MCQ topics, one
 * count per coding topic. `taggedFor` adds how many of them are tagged with that company.
 */
async function poolCounts(companies: readonly ReadinessCompany[], taggedFor?: string) {
  const needs = companies.flatMap((c) => [...coverageNeeds(c.rounds).values()]);
  const mcq = [...new Set(needs.filter((n) => n.type === "MCQ").map((n) => n.topicId))];
  const coding = [...new Set(needs.filter((n) => n.type === "CODING").map((n) => n.topicId))];
  const tagged = taggedFor ? { companies: { some: { companyId: taggedFor } } } : null;
  const grouped = (where: object) =>
    db.question
      .groupBy({
        by: ["topicId"],
        where: { ...questionPool({ in: mcq }), ...where },
        _count: { _all: true },
      })
      .then((rows) => new Map(rows.map((r) => [`MCQ:${r.topicId}`, r._count._all])));
  // Problems sit in topics through the join table, so they are counted there in one query, with
  // the same rule as problemPool in blueprints.ts: published and passed the judge check.
  const counted = (companyId?: string) =>
    db.$queryRaw<{ topicId: string; n: number }[]>`
      SELECT pt."B" AS "topicId", count(*)::int AS n
        FROM "_ProblemToTopic" pt JOIN problems p ON p.id = pt."A"
       WHERE pt."B" = ANY(${coding}) AND p.status = 'PUBLISHED' AND p.validated_at IS NOT NULL
         ${companyId ? Prisma.sql`AND EXISTS (SELECT 1 FROM company_items ci WHERE ci.problem_id = p.id AND ci.company_id = ${companyId})` : Prisma.empty}
       GROUP BY 1`.then((rows) => new Map(rows.map((r) => [`CODING:${r.topicId}`, r.n])));

  const [mcqAll, mcqTagged, codingAll, codingTagged] = await Promise.all([
    mcq.length ? grouped({}) : new Map<string, number>(),
    mcq.length && tagged ? grouped(tagged) : new Map<string, number>(),
    coding.length ? counted() : new Map<string, number>(),
    coding.length && taggedFor ? counted(taggedFor) : new Map<string, number>(),
  ]);
  return (type: SectionType, topicId: string) => ({
    available: (type === "MCQ" ? mcqAll : codingAll).get(`${type}:${topicId}`) ?? 0,
    tagged: (type === "MCQ" ? mcqTagged : codingTagged).get(`${type}:${topicId}`) ?? 0,
  });
}

/** The checklist, progress and next step of each company, by id. */
export async function companiesReadiness(
  companies: readonly ReadinessCompany[],
  { taggedFor }: { taggedFor?: string } = {},
) {
  const ids = companies.map((c) => c.id);
  const [counts, pools] = await Promise.all([linkedCounts(ids), poolCounts(companies, taggedFor)]);
  const now = new Date();
  return new Map(
    companies.map((company) => {
      const linked = counts(company.id);
      const coverage: Coverage[] = [...coverageNeeds(company.rounds).values()].map((n) => ({
        ...n,
        ...pools(n.type, n.topicId),
      }));
      const items = readinessChecklist({
        status: company.status,
        overview: company.overview,
        hiringFor: company.hiringFor,
        stale: isStale(company.lastVerifiedAt, now),
        sources: company.sources,
        rounds: company.rounds,
        ...linked,
        coverage,
      });
      return [
        company.id,
        {
          items,
          done: items.filter((i) => i.done).length,
          total: items.length,
          next: nextStep(items),
          coverage,
          counts: linked,
        },
      ] as const;
    }),
  );
}

/** One company's checklist, with how many items in each topic are tagged with it. */
export async function companyReadiness(
  company: Omit<ReadinessCompany, "sources"> & { sources: readonly unknown[] },
) {
  const all = await companiesReadiness([{ ...company, sources: company.sources.length }], {
    taggedFor: company.id,
  });
  return all.get(company.id)!;
}

export type CompanyReadiness = Awaited<ReturnType<typeof companyReadiness>>;
