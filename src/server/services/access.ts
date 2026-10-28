import "server-only";

import { accessFrom, coversCompany, type Access } from "@/lib/commerce/access";
import { isAdmin } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { env } from "@/server/env";

type Viewer = Pick<CurrentUser, "id" | "roles">;

/**
 * What this user has paid for, right now (D-040). Admins previewing the student app are unlimited,
 * and so is everyone in TEST_MODE (no payments while testing).
 */
export async function getAccess(user: Viewer, now = new Date()): Promise<Access> {
  const rows = await db.entitlement.findMany({
    where: { userId: user.id, revokedAt: null, endsAt: { gt: now } },
    select: { kind: true, companyId: true, startsAt: true, endsAt: true, revokedAt: true },
  });
  return accessFrom(rows, now, env().TEST_MODE || isAdmin(user.roles));
}

/** Companies that ask this question (published company pages only). */
async function questionCompanies(questionId: string) {
  const rows = await db.companyItem.findMany({
    where: { questionId },
    select: { companyId: true },
  });
  return rows.map((r) => r.companyId);
}

async function problemCompanies(problemId: string) {
  const rows = await db.companyItem.findMany({ where: { problemId }, select: { companyId: true } });
  return rows.map((r) => r.companyId);
}

/** Pro, or a pack for a company that asks this question. */
export async function questionCovered(access: Access, questionId: string): Promise<boolean> {
  if (coversCompany(access, [])) return true;
  if (!access.packs.size) return false;
  return coversCompany(access, await questionCompanies(questionId));
}

export async function problemCovered(access: Access, problemId: string): Promise<boolean> {
  if (coversCompany(access, [])) return true;
  if (!access.packs.size) return false;
  return coversCompany(access, await problemCompanies(problemId));
}
