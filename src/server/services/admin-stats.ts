import "server-only";

import { ADMIN_ROLES } from "@/lib/permissions";
import { db } from "@/server/db";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MONTHS = 6;

export type AdminOverviewStats = {
  students: number;
  admins: number;
  auditThisWeek: number;
  questions: { published: number; total: number };
  queues: {
    /** Questions, coding problems and design questions not yet published. */
    drafts: number;
    importsAwaitingConfirmation: number;
    failedImports: number;
    staleCompanies: number;
    stuckJobs: number;
    openReports: number;
    pendingDriveReports: number;
    flaggedComments: number;
  };
};

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const now = Date.now();
  const weekAgo = new Date(now - WEEK_MS);
  const staleBefore = new Date(now);
  staleBefore.setUTCMonth(staleBefore.getUTCMonth() - STALE_MONTHS);

  const [
    students,
    admins,
    auditThisWeek,
    published,
    total,
    draftQuestions,
    draftProblems,
    draftDesign,
    awaiting,
    failed,
    stale,
    stuckJobs,
    openReports,
    pendingDriveReports,
    flaggedComments,
  ] = await Promise.all([
    db.user.count({ where: { roles: { has: "STUDENT" } } }),
    db.user.count({ where: { roles: { hasSome: [...ADMIN_ROLES] } } }),
    db.auditLog.count({ where: { createdAt: { gte: weekAgo } } }),
    db.question.count({ where: { status: "PUBLISHED" } }),
    db.question.count({ where: { status: { not: "ARCHIVED" } } }),
    db.question.count({ where: { status: { in: ["DRAFT", "IN_REVIEW"] } } }),
    db.problem.count({ where: { status: { in: ["DRAFT", "IN_REVIEW"] } } }),
    db.designQuestion.count({ where: { status: { in: ["DRAFT", "IN_REVIEW"] } } }),
    db.importBatch.count({ where: { status: "PREVIEW_READY" } }),
    db.importBatch.count({ where: { status: "FAILED", createdAt: { gte: weekAgo } } }),
    db.company.count({
      where: { status: { not: "ARCHIVED" }, lastVerifiedAt: { lt: staleBefore } },
    }),
    db.job.count({ where: { status: "FAILED", createdAt: { gte: weekAgo } } }),
    db.errorReport.count({ where: { status: "OPEN" } }),
    db.driveReport.count({ where: { status: "PENDING" } }),
    db.questionComment.count({
      where: {
        OR: [
          { status: "VISIBLE", flagCount: { gt: 0 } },
          { status: "HIDDEN", moderatedAt: null, flagCount: { gt: 0 } },
        ],
      },
    }),
  ]);

  return {
    students,
    admins,
    auditThisWeek,
    questions: { published, total },
    queues: {
      drafts: draftQuestions + draftProblems + draftDesign,
      importsAwaitingConfirmation: awaiting,
      failedImports: failed,
      staleCompanies: stale,
      stuckJobs,
      openReports,
      pendingDriveReports,
      flaggedComments,
    },
  };
}
