import "server-only";

import type { ContentStatus, RoundType, SectionType } from "@/generated/prisma/enums";
import {
  coverageNeeds,
  nextStep,
  readinessChecklist,
  type Coverage,
} from "@/lib/content/company-readiness";
import { DRAFT_STATUSES } from "@/lib/content/workflow";
import { db } from "@/server/db";
import { POOL_PROBLEM, questionPool } from "@/server/services/blueprints";

// The company checklist (D-067): the Overview tab for one company, the companies list for all.
// The same counts either way: a few grouped queries, whatever the number of companies.

export type ReadinessCompany = {
  id: string;
  status: ContentStatus;
  overview: string;
  hiringFor: readonly string[];
  stale: boolean;
  /** How many sources the company has. */
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

type Tally = { published: number; draft: number; checked: number };
const ZERO: Tally = { published: 0, draft: 0, checked: 0 };
type StatusRow = { companyId: string; status: ContentStatus; checked?: boolean; n: number };

/** Rows of (company, status, count) folded into one tally per company, in one pass. */
function tally(rows: readonly StatusRow[]) {
  const byCompany = new Map<string, Tally>();
  for (const r of rows) {
    const t = { ...(byCompany.get(r.companyId) ?? ZERO) };
    if (r.status === "PUBLISHED") t.published += r.n;
    else if ((DRAFT_STATUSES as readonly string[]).includes(r.status)) {
      t.draft += r.n;
      if (r.checked) t.checked += r.n;
    }
    byCompany.set(r.companyId, t);
  }
  return (companyId: string) => byCompany.get(companyId) ?? ZERO;
}

/**
 * Linked questions, problems and interview questions, and company mocks, per company and status.
 * Raw SQL because the links are a separate table and Prisma's groupBy can't group by a
 * relation's company.
 */
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
    // Few per company: loaded whole, so the workspace can link the company mock too.
    db.testBlueprint.findMany({
      where: { companyId: { in: ids }, kind: "COMPANY_MOCK", status: { not: "ARCHIVED" } },
      select: { id: true, companyId: true, status: true },
    }),
  ]);
  const [q, p, d] = [tally(questions), tally(problems), tally(interviews)];
  const m = tally(mocks.map((x) => ({ companyId: x.companyId!, status: x.status, n: 1 })));
  return (companyId: string) => {
    const own = mocks.filter((x) => x.companyId === companyId);
    return {
      questions: q(companyId),
      problems: p(companyId),
      interviews: d(companyId),
      mocks: m(companyId),
      /** The company mock to open from the workspace: a published one if there is one. */
      mockId: (own.find((x) => x.status === "PUBLISHED") ?? own[0])?.id ?? null,
    };
  };
}

/**
 * Published items in every topic the companies' mocks need, with the same rules a mock draws by
 * (questionPool, POOL_PROBLEM). `taggedFor` also counts those tagged with that company.
 */
async function poolCounts(companies: readonly ReadinessCompany[], taggedFor?: string) {
  const needs = companies.flatMap((c) => [...coverageNeeds(c.rounds).values()]);
  const ofType = (type: SectionType) => [
    ...new Set(needs.filter((n) => n.type === type).map((n) => n.topicId)),
  ];
  const [mcq, coding] = [ofType("MCQ"), ofType("CODING")];
  const tagged = (companyId?: string) => (companyId ? { companies: { some: { companyId } } } : {});

  const questionsByTopic = async (companyId?: string) =>
    new Map(
      mcq.length
        ? (
            await db.question.groupBy({
              by: ["topicId"],
              where: { ...questionPool({ in: mcq }), ...tagged(companyId) },
              _count: { _all: true },
            })
          ).map((r) => [r.topicId, r._count._all])
        : [],
    );
  // A problem can sit in several topics, so it's counted from each topic's side.
  const problemsByTopic = async (companyId?: string) =>
    new Map(
      coding.length
        ? (
            await db.topic.findMany({
              where: { id: { in: coding } },
              select: {
                id: true,
                _count: {
                  select: { problems: { where: { ...POOL_PROBLEM, ...tagged(companyId) } } },
                },
              },
            })
          ).map((t) => [t.id, t._count.problems])
        : [],
    );

  const [mcqAll, mcqTagged, codingAll, codingTagged] = await Promise.all([
    questionsByTopic(),
    taggedFor ? questionsByTopic(taggedFor) : new Map<string, number>(),
    problemsByTopic(),
    taggedFor ? problemsByTopic(taggedFor) : new Map<string, number>(),
  ]);
  const maps = { MCQ: [mcqAll, mcqTagged], CODING: [codingAll, codingTagged] } as const;
  return (type: SectionType, topicId: string) => ({
    available: maps[type][0].get(topicId) ?? 0,
    tagged: maps[type][1].get(topicId) ?? 0,
  });
}

/** The checklist, progress and next step of each company, by id. */
export async function companiesReadiness(
  companies: readonly ReadinessCompany[],
  { taggedFor }: { taggedFor?: string } = {},
) {
  const ids = companies.map((c) => c.id);
  const [counts, pools] = await Promise.all([linkedCounts(ids), poolCounts(companies, taggedFor)]);
  return new Map(
    companies.map((company) => {
      const { mockId, ...linked } = counts(company.id);
      const coverage: Coverage[] = [...coverageNeeds(company.rounds).values()].map((n) => ({
        ...n,
        ...pools(n.type, n.topicId),
      }));
      const items = readinessChecklist({ ...company, ...linked, coverage });
      return [
        company.id,
        {
          items,
          done: items.filter((i) => i.done).length,
          total: items.length,
          next: nextStep(items),
          coverage,
          counts: linked,
          mockId,
        },
      ] as const;
    }),
  );
}

/** One company's checklist (its admin page has the sources themselves), with tagged counts. */
export async function companyReadiness(
  company: Omit<ReadinessCompany, "sources"> & { sources: readonly unknown[] },
) {
  const one = { ...company, sources: company.sources.length };
  return (await companiesReadiness([one], { taggedFor: company.id })).get(company.id)!;
}

export type CompanyReadiness = Awaited<ReturnType<typeof companyReadiness>>;
