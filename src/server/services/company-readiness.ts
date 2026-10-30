import "server-only";

import {
  coverageNeeds,
  nextStep,
  readinessChecklist,
  type Coverage,
} from "@/lib/content/company-readiness";
import { DRAFT_STATUSES } from "@/lib/content/workflow";
import { db } from "@/server/db";
import { problemPool, questionPool } from "@/server/services/blueprints";
import type { getCompanyBySlug } from "@/server/services/companies";

// The admin Overview tab's checklist (D-067): grouped counts, a handful of queries per company.

type Company = NonNullable<Awaited<ReturnType<typeof getCompanyBySlug>>>;

/** Published items per section topic, against what the company mock will need. */
async function sectionCoverage(company: Company): Promise<Coverage[]> {
  const needs = [...coverageNeeds(company.rounds).values()];
  const mcqTopics = needs.filter((n) => n.type === "MCQ").map((n) => n.topicId);
  const tagged = { companies: { some: { companyId: company.id } } };
  const count = (rows: { topicId: string; _count: { _all: number } }[], topicId: string) =>
    rows.find((r) => r.topicId === topicId)?._count._all ?? 0;

  // MCQs: one grouped count per question. Coding sections have a few topics: one count each.
  const [mcqAll, mcqTagged, coding] = await Promise.all([
    mcqTopics.length
      ? db.question.groupBy({
          by: ["topicId"],
          where: questionPool({ in: mcqTopics }),
          _count: { _all: true },
        })
      : [],
    mcqTopics.length
      ? db.question.groupBy({
          by: ["topicId"],
          where: { ...questionPool({ in: mcqTopics }), ...tagged },
          _count: { _all: true },
        })
      : [],
    Promise.all(
      needs
        .filter((n) => n.type === "CODING")
        .map(async (n) => {
          const [available, mine] = await Promise.all([
            db.problem.count({ where: problemPool(n.topicId) }),
            db.problem.count({ where: { ...problemPool(n.topicId), ...tagged } }),
          ]);
          return [n.topicId, { available, tagged: mine }] as const;
        }),
    ).then((rows) => new Map(rows)),
  ]);

  return needs.map((n) =>
    n.type === "MCQ"
      ? { ...n, available: count(mcqAll, n.topicId), tagged: count(mcqTagged, n.topicId) }
      : { ...n, ...coding.get(n.topicId)! },
  );
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
