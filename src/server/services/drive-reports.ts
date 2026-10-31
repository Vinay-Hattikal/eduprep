import "server-only";

// "Asked today" drive reports (D-051): a two-minute form filed right after a hiring drive. A
// moderator checks each one (aim: within hours) and it appears on the company page.

import type { Difficulty, ExperienceStatus, RoundType } from "@/generated/prisma/enums";
import { addDays, istDay } from "@/lib/learning/dates";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";
import { awardBadges } from "@/server/services/engagement";
import { notify } from "@/server/services/notifications";
import { getSetting } from "@/server/services/settings";

/** Reports are about recent drives only: today and the previous days. */
export const REPORT_WINDOW_DAYS = 7;
/** How long reports stay in "asked recently" on the company page. */
export const RECENT_DAYS = 60;

export type DriveReportInput = {
  companyId: string;
  driveDate: Date;
  roundType: RoundType;
  platform: string | null;
  topics: string | null;
  questions: string;
  difficulty: Difficulty;
  location: string | null;
};

export async function submitDriveReport(
  user: Pick<CurrentUser, "id">,
  input: DriveReportInput,
  today = istDay(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const company = await db.company.findFirst({
    where: { id: input.companyId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!company) return { ok: false, error: "Choose a company." };
  if (input.driveDate > today || input.driveDate < addDays(today, -REPORT_WINDOW_DAYS))
    return {
      ok: false,
      error: `Reports are for drives in the last ${REPORT_WINDOW_DAYS} days. For older ones, share an interview experience.`,
    };
  const recent = await db.driveReport.count({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 86_400_000) } },
  });
  if (recent >= 5)
    return { ok: false, error: "You've sent 5 reports today. Thank you! Try again tomorrow." };
  await db.driveReport.create({ data: { ...input, userId: user.id } });
  return { ok: true };
}

/** Approved reports for a company page, newest drive first. */
export async function recentDriveReports(companyId: string, today = istDay(), take = 20) {
  return db.driveReport.findMany({
    where: {
      companyId,
      status: "APPROVED",
      driveDate: { gte: addDays(today, -RECENT_DAYS) },
    },
    orderBy: [{ driveDate: "desc" }, { approvedAt: "desc" }],
    take,
    select: {
      id: true,
      driveDate: true,
      roundType: true,
      platform: true,
      topics: true,
      questions: true,
      difficulty: true,
      location: true,
    },
  });
}

/** Companies with approved reports in the last few days, for "fresh from drives" lists. */
export async function companiesWithFreshReports(days = 3, today = istDay()) {
  const rows = await db.driveReport.groupBy({
    by: ["companyId"],
    where: { status: "APPROVED", driveDate: { gte: addDays(today, -days) } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.companyId, r._count._all]));
}

export async function listMyDriveReports(userId: string) {
  return db.driveReport.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { company: { select: { name: true, slug: true } } },
  });
}

export async function listDriveReportsForModeration({
  status = "PENDING",
  companyId,
  take = 100,
}: { status?: ExperienceStatus; companyId?: string; take?: number } = {}) {
  return db.driveReport.findMany({
    where: { status, ...(companyId && { companyId }) },
    orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
    take,
    include: {
      company: { select: { name: true, slug: true } },
      user: { select: { name: true, email: true } },
    },
  });
}

/** Approve (optionally with edits) or reject. Approval awards points and a badge once. */
export async function moderateDriveReport(
  id: string,
  decision: "approve" | "reject",
  actor: Pick<CurrentUser, "id">,
  edits: { questions?: string; topics?: string | null } = {},
  note?: string,
): Promise<{ ok: true; companySlug: string } | { ok: false; error: string }> {
  const report = await db.driveReport.findUnique({
    where: { id },
    include: { company: { select: { name: true, slug: true } }, user: { select: { name: true } } },
  });
  if (!report) return { ok: false, error: "Not found." };
  if (decision === "reject" && !note?.trim()) return { ok: false, error: "Tell the student why." };
  const firstApproval = decision === "approve" && !report.approvedAt;
  const points = firstApproval ? await getSetting("points.driveReportApproved") : 0;
  await db.$transaction(async (tx) => {
    await tx.driveReport.update({
      where: { id },
      data: {
        status: decision === "approve" ? "APPROVED" : "REJECTED",
        moderatorNote: note?.trim() || null,
        moderatedById: actor.id,
        ...(decision === "approve" && {
          ...edits,
          approvedAt: report.approvedAt ?? new Date(),
        }),
      },
    });
    if (points) {
      await tx.userStats.upsert({
        where: { userId: report.userId },
        create: { userId: report.userId, points },
        update: { points: { increment: points } },
      });
    }
    if (decision === "approve") await awardBadges(tx, report.userId, ["contributor"]);
    await recordAudit(
      {
        actorId: actor.id,
        action: `drive-report.${decision}`,
        entityType: "drive-report",
        entityId: id,
        after: { note },
      },
      tx,
    );
  });
  await notify(report.userId, "drive-report.decision", {
    name: report.user.name,
    company: report.company.name,
    approved: decision === "approve",
    points,
    note: note?.trim() || null,
  });
  return { ok: true, companySlug: report.company.slug };
}
