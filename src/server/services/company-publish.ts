import "server-only";

import { checkQuestion, hasErrors } from "@/lib/content/question-rules";
import { DRAFT_STATUSES } from "@/lib/content/workflow";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";
import { transitionBlueprint } from "@/server/services/blueprints";
import { setCompanyStatus } from "@/server/services/companies";
import { transitionProblem } from "@/server/services/problems";
import { publishQuestions } from "@/server/services/questions";

// "Publish everything" for one company (D-067): its draft questions, judge-checked problems,
// the company and its mock, each through the same rules as its own Publish button.

type Actor = { id: string; roles: Role[] };

/** What publishing would do now, for the confirmation. */
export async function companyPublishPlan(companyId: string) {
  const linked = { companies: { some: { companyId } }, status: { in: DRAFT_STATUSES } };
  const [company, questions, problems, mocks] = await Promise.all([
    db.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { status: true, _count: { select: { sources: true } } },
    }),
    db.question.findMany({ where: linked, orderBy: { externalId: "asc" } }),
    db.problem.findMany({
      where: linked,
      orderBy: { externalId: "asc" },
      select: { id: true, externalId: true, title: true, validatedAt: true },
    }),
    db.testBlueprint.findMany({
      where: { companyId, kind: "COMPANY_MOCK", status: { in: DRAFT_STATUSES } },
      select: { id: true, title: true },
    }),
  ]);
  const failing = questions.filter((q) => hasErrors(checkQuestion(q)));
  return {
    questions: {
      ready: questions.filter((q) => !failing.includes(q)).map((q) => q.id),
      failing: failing.map((q) => q.externalId),
    },
    problems: {
      ready: problems.filter((p) => p.validatedAt).map((p) => ({ id: p.id, title: p.title })),
      unchecked: problems.filter((p) => !p.validatedAt).map((p) => p.title),
    },
    mocks,
    company: {
      publish: company.status !== "PUBLISHED" && company.status !== "ARCHIVED",
      blocker: company._count.sources ? null : "Add at least one source before publishing.",
    },
  };
}

export type CompanyPublishPlan = Awaited<ReturnType<typeof companyPublishPlan>>;

export type CompanyPublishResult = {
  questions: number;
  problems: number;
  mocks: number;
  company: boolean;
  /** Why something stayed a draft. */
  notes: string[];
};

/**
 * Publishes in dependency order: questions and problems first (the mock draws from them), then
 * the company, then its mock. Nothing goes live that its own Publish button would refuse.
 */
export async function publishCompanyContent(
  companyId: string,
  actor: Actor,
): Promise<CompanyPublishResult> {
  const plan = await companyPublishPlan(companyId);
  const notes: string[] = [];

  const questions = await publishQuestions(plan.questions.ready, actor);
  notes.push(...questions.errors);
  for (const id of plan.questions.failing)
    notes.push(`${id} fails the automatic checks. Open it and fix the errors.`);

  let problems = 0;
  for (const problem of plan.problems.ready) {
    const result = await transitionProblem(problem.id, "publish", actor);
    if (result.ok) problems += 1;
    else notes.push(`${problem.title}: ${result.error}`);
  }
  for (const title of plan.problems.unchecked)
    notes.push(`${title}: hasn't passed the judge check yet.`);

  let company = false;
  if (plan.company.publish) {
    const result = await setCompanyStatus(companyId, "publish", actor);
    company = result.ok;
    if (!result.ok) notes.push(`Company: ${result.error}`);
  }

  let mocks = 0;
  for (const mock of plan.mocks) {
    const result = await transitionBlueprint(mock.id, "publish", actor);
    if (result.ok) mocks += 1;
    else notes.push(...result.errors.map((e) => `${mock.title}: ${e}`));
  }

  await recordAudit({
    actorId: actor.id,
    action: "company.publish_all",
    entityType: "company",
    entityId: companyId,
    after: { questions: questions.done, problems, mocks, company, notes: notes.length },
  });
  return { questions: questions.done, problems, mocks, company, notes };
}
