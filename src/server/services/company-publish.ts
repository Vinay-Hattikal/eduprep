import "server-only";

import { DRAFT_STATUSES } from "@/lib/content/workflow";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";
import { publishProblems, transitionBlueprint } from "@/server/services/blueprints";
import { companyPublishBlocker, setCompanyStatus } from "@/server/services/companies";
import { setDesignStatus } from "@/server/services/design-questions";
import { transitionProblem } from "@/server/services/problems";
import { publishQuestions, questionCheckError } from "@/server/services/questions";

// "Publish everything" for one company (D-067): its draft questions, judge-checked problems,
// the company and its mock, each through the same rules as its own Publish button.

type Actor = Parameters<typeof setCompanyStatus>[2];

/**
 * What publishing would do now, for the Overview. `blockers` also works out why each draft mock
 * can't publish yet (a few counts per mock), which only the preview needs. Null for a missing or
 * archived company.
 */
export async function companyPublishPlan(companyId: string, { blockers = true } = {}) {
  const linked = { companies: { some: { companyId } }, status: { in: DRAFT_STATUSES } };
  const [company, questions, problems, interviews, mocks] = await Promise.all([
    db.company.findUnique({
      where: { id: companyId },
      select: { status: true, _count: { select: { sources: true } } },
    }),
    db.question.findMany({ where: linked, orderBy: { externalId: "asc" } }),
    db.problem.findMany({
      where: linked,
      orderBy: { externalId: "asc" },
      select: { id: true, title: true, validatedAt: true },
    }),
    db.designQuestion.findMany({ where: linked, select: { id: true } }),
    db.testBlueprint.findMany({
      where: { companyId, kind: "COMPANY_MOCK", status: { in: DRAFT_STATUSES } },
      select: { id: true, title: true },
    }),
  ]);
  if (!company || company.status === "ARCHIVED") return null;

  const questionErrors = questions.map(questionCheckError).filter((e) => e !== null);
  const publishCompany = company.status !== "PUBLISHED";
  const companyBlocker = publishCompany ? companyPublishBlocker(company._count.sources) : null;
  const mockBlockers = blockers
    ? await Promise.all(mocks.map((m) => publishProblems(m.id)))
    : mocks.map((): string[] => []);
  const readyProblems = problems.filter((p) => p.validatedAt);

  return {
    questionIds: questions.map((q) => q.id),
    problems: readyProblems.map((p) => ({ id: p.id, title: p.title })),
    interviewIds: interviews.map((d) => d.id),
    mocks,
    publishCompany,
    goLive: {
      questions: questions.length - questionErrors.length,
      problems: readyProblems.length,
      interviews: interviews.length,
      company: publishCompany && !companyBlocker,
      mocks: mockBlockers.filter((b) => !b.length).length,
    },
    /** Why each remaining item stays a draft, in the words of its own Publish button. */
    staysDraft: [
      ...questionErrors,
      ...problems
        .filter((p) => !p.validatedAt)
        .map((p) => `${p.title}: hasn't passed the judge check`),
      ...(companyBlocker ? [`Company: ${companyBlocker}`] : []),
      ...mocks.flatMap((m, i) =>
        mockBlockers[i]!.length
          ? [`${m.title}: ${mockBlockers[i]![0]} (publishing the drafts above may fill it)`]
          : [],
      ),
    ],
  };
}

export type CompanyPublishPlan = NonNullable<Awaited<ReturnType<typeof companyPublishPlan>>>;

export type CompanyPublishResult = {
  questions: number;
  problems: number;
  interviews: number;
  mocks: number;
  company: boolean;
};

/**
 * Publishes in dependency order: questions and problems first (the mock draws from them), then
 * the company, then its mock. Each goes through its own publish rules, so nothing goes live that
 * its Publish button would refuse; what stays draft shows on the Overview afterwards.
 */
export async function publishCompanyContent(
  companyId: string,
  actor: Actor,
): Promise<CompanyPublishResult | { error: string }> {
  const plan = await companyPublishPlan(companyId, { blockers: false });
  if (!plan) return { error: "This company no longer exists or is archived." };

  const questions = (await publishQuestions(plan.questionIds, actor)).done;
  let problems = 0;
  for (const problem of plan.problems)
    if ((await transitionProblem(problem.id, "publish", actor)).ok) problems += 1;
  for (const id of plan.interviewIds) await setDesignStatus(id, "PUBLISHED", actor);
  const interviews = plan.interviewIds.length;
  const company = plan.publishCompany && (await setCompanyStatus(companyId, "publish", actor)).ok;
  let mocks = 0;
  for (const mock of plan.mocks)
    if ((await transitionBlueprint(mock.id, "publish", actor)).ok) mocks += 1;

  const result = { questions, problems, interviews, mocks, company };
  await recordAudit({
    actorId: actor.id,
    action: "company.publish_all",
    entityType: "company",
    entityId: companyId,
    after: result,
  });
  return result;
}
