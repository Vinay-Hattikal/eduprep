// "Publish after import" (D-056): after an import commits, publish what it brought in.
// Each item goes through the same publish rules as the admin buttons, so a question that fails
// the automatic checks or a company without a source stays a draft. Coding problems publish
// from their judge-check job instead (validateProblem's publishBy).

import "server-only";

import type { ImportType } from "@/generated/prisma/enums";
import { DRAFT_STATUSES } from "@/lib/content/workflow";
import { db } from "@/server/db";
import { setCompanyStatus } from "@/server/services/companies";
import { setDesignStatus } from "@/server/services/design-questions";
import { transitionQuestion } from "@/server/services/questions";

/** Import types whose items can be published straight after the import. */
export const PUBLISHABLE_IMPORTS: readonly ImportType[] = [
  "MCQ",
  "COMPANIES",
  "DESIGN_QUESTIONS",
  "CODING_BUNDLE",
  "CODING_PROBLEMS",
  "CODING_PACKAGE",
];

const CODING: readonly ImportType[] = ["CODING_BUNDLE", "CODING_PROBLEMS", "CODING_PACKAGE"];

export function publishesThroughJudge(type: ImportType): boolean {
  return CODING.includes(type);
}

/** Publishes the batch's imported drafts. Returns how many went live. */
export async function publishImported(batchId: string, type: ImportType, actorId: string) {
  const actor = await db.user.findUnique({
    where: { id: actorId },
    select: { id: true, roles: true },
  });
  if (!actor) return 0;
  const ids = [
    ...new Set(
      (
        await db.importRow.findMany({
          where: { batchId, status: "IMPORTED", entityId: { not: null } },
          select: { entityId: true },
        })
      ).map((row) => row.entityId!),
    ),
  ];

  let published = 0;
  if (type === "MCQ") {
    const drafts = await db.question.findMany({
      where: { id: { in: ids }, status: { in: DRAFT_STATUSES } },
      select: { id: true },
    });
    for (const { id } of drafts)
      if ((await transitionQuestion(id, "publish", actor)).ok) published += 1;
  } else if (type === "DESIGN_QUESTIONS") {
    const drafts = await db.designQuestion.findMany({
      where: { id: { in: ids }, status: { in: DRAFT_STATUSES } },
      select: { id: true },
    });
    for (const { id } of drafts) {
      await setDesignStatus(id, "PUBLISHED", actor);
      published += 1;
    }
  } else if (type === "COMPANIES") {
    const drafts = await db.company.findMany({
      where: { id: { in: ids }, status: { in: DRAFT_STATUSES } },
      select: { id: true },
    });
    for (const { id } of drafts)
      if ((await setCompanyStatus(id, "publish", actor)).ok) published += 1;
  }
  return published;
}
