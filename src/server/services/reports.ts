import "server-only";

import type { ReportStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";

export async function listReports(status: ReportStatus | "ALL", take = 100) {
  return db.errorReport.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: { createdAt: status === "OPEN" ? "asc" : "desc" },
    take,
    include: {
      question: { select: { id: true, externalId: true, text: true, status: true } },
      user: { select: { name: true } },
      resolvedBy: { select: { name: true } },
    },
  });
}

/** Closes a report with a reply the student will see. */
export async function resolveReport(
  id: string,
  status: Exclude<ReportStatus, "OPEN">,
  reply: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const report = await db.errorReport.findUnique({ where: { id } });
  if (!report) return { ok: false, error: "This report no longer exists." };
  if (report.status !== "OPEN") return { ok: false, error: "This report is already closed." };

  await db.errorReport.update({
    where: { id },
    data: { status, reply, resolvedById: actorId, resolvedAt: new Date() },
  });
  await recordAudit({
    actorId,
    action: `report.${status === "FIXED" ? "fix" : "reject"}`,
    entityType: "error_report",
    entityId: id,
    after: { questionId: report.questionId, reply },
  });
  return { ok: true };
}

export async function requestCompany(
  userId: string,
  companyName: string,
): Promise<"added" | "duplicate"> {
  const normalized = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const created = await db.companyRequest.createMany({
    data: [{ userId, companyName, normalized }],
    skipDuplicates: true,
  });
  return created.count ? "added" : "duplicate";
}

/** Most-requested missing companies, for the admin companies page (PRD 4.7). */
export async function topCompanyRequests(take = 10) {
  const rows = await db.companyRequest.groupBy({
    by: ["normalized"],
    _count: { _all: true },
    _max: { companyName: true, createdAt: true },
    orderBy: { _count: { normalized: "desc" } },
    take,
  });
  return rows.map((r) => ({
    name: r._max.companyName ?? r.normalized,
    count: r._count._all,
    latest: r._max.createdAt,
  }));
}
