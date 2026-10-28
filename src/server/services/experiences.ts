import "server-only";

import type { ExperienceResult, ExperienceStatus, ProfileType } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";
import { awardBadges } from "@/server/services/engagement";
import { notify } from "@/server/services/notifications";
import { getSetting } from "@/server/services/settings";

export const RESULT_LABELS: Record<ExperienceResult, string> = {
  SELECTED: "Selected",
  REJECTED: "Not selected",
  WAITING: "Waiting for result",
  WITHDREW: "Withdrew",
};

export type ExperienceInput = {
  companyId: string;
  role: string;
  profileType: ProfileType;
  yearsExperience: number | null;
  year: number;
  rounds: string;
  questions: string;
  tips: string | null;
  result: ExperienceResult;
  anonymous: boolean;
};

export async function submitExperience(user: Pick<CurrentUser, "id">, input: ExperienceInput) {
  const company = await db.company.findFirst({
    where: { id: input.companyId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!company) return { ok: false as const, error: "Choose a company." };
  const recent = await db.experience.count({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 86_400_000) } },
  });
  if (recent >= 5)
    return {
      ok: false as const,
      error: "You've shared 5 experiences today. Thank you! Try again tomorrow.",
    };
  await db.experience.create({ data: { ...input, userId: user.id } });
  return { ok: true as const };
}

export type ExperienceFilter = { role?: string; profileType?: ProfileType; year?: number };

/** Approved experiences for a company page. Contributors are anonymous unless they chose otherwise. */
export async function listCompanyExperiences(
  companyId: string,
  filter: ExperienceFilter = {},
  take = 50,
) {
  const rows = await db.experience.findMany({
    where: {
      companyId,
      status: "APPROVED",
      ...(filter.role && { role: { contains: filter.role, mode: "insensitive" } }),
      ...(filter.profileType && { profileType: filter.profileType }),
      ...(filter.year && { year: filter.year }),
    },
    orderBy: [{ year: "desc" }, { approvedAt: "desc" }],
    take,
    include: { user: { select: { name: true } } },
  });
  return rows.map(({ user, ...row }) => ({ ...row, author: row.anonymous ? null : user.name }));
}

export async function experienceFacets(companyId: string) {
  const rows = await db.experience.findMany({
    where: { companyId, status: "APPROVED" },
    select: { role: true, year: true },
  });
  return {
    roles: [...new Set(rows.map((r) => r.role))].sort(),
    years: [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a),
    total: rows.length,
  };
}

export async function listMyExperiences(userId: string) {
  return db.experience.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { company: { select: { name: true, slug: true } } },
  });
}

export async function listForModeration(status: ExperienceStatus = "PENDING") {
  return db.experience.findMany({
    where: { status },
    orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
    take: 100,
    include: {
      company: { select: { name: true, slug: true } },
      user: { select: { name: true, email: true } },
    },
  });
}

/** Approve (optionally with edits) or reject. Approval awards the contributor points once. */
export async function moderateExperience(
  id: string,
  decision: "approve" | "reject",
  actor: { id: string },
  edits: { rounds?: string; questions?: string; tips?: string | null } = {},
  note?: string,
) {
  const experience = await db.experience.findUnique({
    where: { id },
    include: { company: { select: { name: true, slug: true } }, user: { select: { name: true } } },
  });
  if (!experience) return { ok: false as const, error: "Not found." };
  if (decision === "reject" && !note?.trim())
    return { ok: false as const, error: "Tell the contributor why." };
  const firstApproval = decision === "approve" && !experience.approvedAt;
  const points = firstApproval ? await getSetting("points.experienceApproved") : 0;
  await db.$transaction(async (tx) => {
    await tx.experience.update({
      where: { id },
      data: {
        status: decision === "approve" ? "APPROVED" : "REJECTED",
        moderatorNote: note?.trim() || null,
        moderatedById: actor.id,
        ...(decision === "approve" && {
          ...edits,
          approvedAt: experience.approvedAt ?? new Date(),
        }),
      },
    });
    if (points) {
      await tx.userStats.upsert({
        where: { userId: experience.userId },
        create: { userId: experience.userId, points },
        update: { points: { increment: points } },
      });
    }
    if (decision === "approve") await awardBadges(tx, experience.userId, ["contributor"]);
    await recordAudit(
      {
        actorId: actor.id,
        action: `experience.${decision}`,
        entityType: "experience",
        entityId: id,
        after: { note },
      },
      tx,
    );
  });
  await notify(experience.userId, "experience.decision", {
    name: experience.user.name,
    company: experience.company.name,
    approved: decision === "approve",
    points,
    note: note?.trim() || null,
  });
  return { ok: true as const, companySlug: experience.company.slug };
}
