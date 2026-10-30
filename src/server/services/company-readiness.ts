import "server-only";

import {
  coverageKey,
  coverageNeeds,
  nextStep,
  readinessChecklist,
  type Coverage,
} from "@/lib/content/company-readiness";
import { DRAFT_STATUSES } from "@/lib/content/workflow";
import { db } from "@/server/db";
import type { getCompanyBySlug } from "@/server/services/companies";

// The admin Overview tab's checklist (D-067): grouped counts, a handful of queries per company.

type Company = NonNullable<Awaited<ReturnType<typeof getCompanyBySlug>>>;

/** Published items per section topic, against what the company mock will need. */
async function sectionCoverage(company: Company): Promise<Coverage[]> {
  const needs = [...coverageNeeds(company.rounds).values()];
  const mcqTopics = needs.filter((n) => n.type === "MCQ").map((n) => n.topicId);
  const codingTopics = needs.filter((n) => n.type === "CODING").map((n) => n.topicId);
  const tagged = { companies: { some: { companyId: company.id } } };
  const published = { status: "PUBLISHED" as const };
  const checkedProblems = { ...published, validatedAt: { not: null } };

  const [mcqAll, mcqTagged, problems] = await Promise.all([
    mcqTopics.length
      ? db.question.groupBy({
          by: ["topicId"],
          where: { ...published, topicId: { in: mcqTopics } },
          _count: { _all: true },
        })
      : [],
    mcqTopics.length
      ? db.question.groupBy({
          by: ["topicId"],
          where: { ...published, ...tagged, topicId: { in: mcqTopics } },
          _count: { _all: true },
        })
      : [],
    // A problem can sit in several topics, so count per topic from the problem's topic list.
    codingTopics.length
      ? db.problem.findMany({
          where: { ...checkedProblems, topics: { some: { id: { in: codingTopics } } } },
          select: {
            topics: { where: { id: { in: codingTopics } }, select: { id: true } },
            companies: { where: { companyId: company.id }, select: { id: true } },
          },
        })
      : [],
  ]);

  const counts = new Map<string, { available: number; tagged: number }>();
  const add = (key: string, field: "available" | "tagged", n: number) => {
    const entry = counts.get(key) ?? { available: 0, tagged: 0 };
    entry[field] += n;
    counts.set(key, entry);
  };
  for (const row of mcqAll) add(coverageKey("MCQ", row.topicId), "available", row._count._all);
  for (const row of mcqTagged) add(coverageKey("MCQ", row.topicId), "tagged", row._count._all);
  for (const problem of problems)
    for (const topic of problem.topics) {
      add(coverageKey("CODING", topic.id), "available", 1);
      if (problem.companies.length) add(coverageKey("CODING", topic.id), "tagged", 1);
    }

  return needs.map((n) => ({
    ...n,
    ...(counts.get(coverageKey(n.type, n.topicId)) ?? { available: 0, tagged: 0 }),
  }));
}

/** The company's checklist, progress and next step. */
export async function companyReadiness(company: Company) {
  const linked = { companies: { some: { companyId: company.id } } };
  const [questions, problems, mocks, coverage] = await Promise.all([
    db.question.groupBy({
      by: ["status"],
      where: { ...linked, status: { not: "ARCHIVED" } },
      _count: { _all: true },
    }),
    db.problem.findMany({
      where: { ...linked, status: { not: "ARCHIVED" } },
      select: { status: true, validatedAt: true },
    }),
    db.testBlueprint.groupBy({
      by: ["status"],
      where: { companyId: company.id, kind: "COMPANY_MOCK", status: { not: "ARCHIVED" } },
      _count: { _all: true },
    }),
    sectionCoverage(company),
  ]);
  const byStatus = (rows: { status: string; _count: { _all: number } }[]) => ({
    published: rows.find((r) => r.status === "PUBLISHED")?._count._all ?? 0,
    draft: rows
      .filter((r) => (DRAFT_STATUSES as readonly string[]).includes(r.status))
      .reduce((n, r) => n + r._count._all, 0),
  });
  const draftProblems = problems.filter((p) => p.status !== "PUBLISHED");

  const items = readinessChecklist({
    status: company.status,
    overview: company.overview,
    hiringFor: company.hiringFor,
    stale: company.stale,
    sources: company.sources.length,
    rounds: company.rounds,
    questions: byStatus(questions),
    problems: {
      published: problems.length - draftProblems.length,
      draft: draftProblems.length,
      checked: draftProblems.filter((p) => p.validatedAt).length,
    },
    mocks: byStatus(mocks),
    coverage,
  });
  return {
    items,
    done: items.filter((i) => i.done).length,
    total: items.length,
    next: nextStep(items),
    coverage,
  };
}

export type CompanyReadiness = Awaited<ReturnType<typeof companyReadiness>>;
