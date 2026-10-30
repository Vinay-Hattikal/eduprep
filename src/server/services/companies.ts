import "server-only";

import type { ContentStatus } from "@/generated/prisma/enums";
import { isStale, type CompanyStatusAction } from "@/lib/content/companies";
import { can } from "@/lib/permissions";
import type { CompanyFormValues } from "@/schemas/company";
import { DRAFT_STATUSES } from "@/lib/content/workflow";
import { db } from "@/server/db";
import type { CurrentUser } from "@/server/auth";
import { recordAudit } from "@/server/services/audit";

export async function listCompanies() {
  const companies = await db.company.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { rounds: true, sources: true, items: true } } },
  });
  const now = new Date();
  return companies.map((company) => ({ ...company, stale: isStale(company.lastVerifiedAt, now) }));
}

export async function getCompanyBySlug(slug: string) {
  const company = await loadCompany(slug);
  if (!company) return null;
  // Counts only: the admin tabs list the linked items themselves (D-057).
  const [questionCount, problemCount] = await Promise.all([
    db.companyItem.count({ where: { companyId: company.id, questionId: { not: null } } }),
    db.companyItem.count({ where: { companyId: company.id, problemId: { not: null } } }),
  ]);
  return {
    ...company,
    questionCount,
    problemCount,
    stale: isStale(company.lastVerifiedAt, new Date()),
  };
}

function loadCompany(slug: string) {
  return db.company.findUnique({
    where: { slug },
    include: {
      rounds: {
        orderBy: { order: "asc" },
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: { topics: { select: { id: true, slug: true, name: true } } },
          },
        },
      },
      sources: { orderBy: { checkedOn: "desc" } },
    },
  });
}

export type CompanySaveResult =
  | { ok: true; id: string; slug: string; status: ContentStatus }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

export async function saveCompany(
  values: CompanyFormValues,
  actor: CurrentUser,
): Promise<CompanySaveResult> {
  const { id, ...data } = values;

  if (!id) {
    if (await db.company.findUnique({ where: { slug: data.slug } })) {
      return { ok: false, fieldErrors: { slug: "This slug is already used." } };
    }
    const created = await db.company.create({ data: { ...data, status: "DRAFT" } });
    await recordAudit({
      actorId: actor.id,
      action: "company.create",
      entityType: "company",
      entityId: created.id,
    });
    return { ok: true, id: created.id, slug: created.slug, status: created.status };
  }

  const before = await db.company.findUnique({ where: { id } });
  if (!before) return { ok: false, fieldErrors: {}, formError: "This company no longer exists." };
  // The slug is part of public URLs and import files, so it can't change after creation.
  const { slug: _slug, ...changes } = data;
  const updated = await db.company.update({
    where: { id },
    // Edited published pages go back to draft for review, like questions (D-010).
    data: { ...changes, status: before.status === "ARCHIVED" ? "ARCHIVED" : "DRAFT" },
  });
  await recordAudit({
    actorId: actor.id,
    action: "company.update",
    entityType: "company",
    entityId: id,
    before: { status: before.status },
    after: { status: updated.status },
  });
  return { ok: true, id: updated.id, slug: updated.slug, status: updated.status };
}

const STATUS_RULES: Record<CompanyStatusAction, { from: ContentStatus[]; to: ContentStatus }> = {
  publish: { from: DRAFT_STATUSES, to: "PUBLISHED" },
  unpublish: { from: ["PUBLISHED"], to: "DRAFT" },
  archive: { from: ["DRAFT", "IN_REVIEW", "PUBLISHED"], to: "ARCHIVED" },
  restore: { from: ["ARCHIVED"], to: "DRAFT" },
};

export function companyActions(
  status: ContentStatus,
  roles: CurrentUser["roles"],
): CompanyStatusAction[] {
  if (!can(roles, "companies.publish")) return [];
  return (Object.keys(STATUS_RULES) as CompanyStatusAction[]).filter((a) =>
    STATUS_RULES[a].from.includes(status),
  );
}

/** Every company fact needs a source (D-019, data-import.md 4.5). */
export function companyPublishBlocker(sources: number): string | null {
  return sources ? null : "Add at least one source before publishing.";
}

export async function setCompanyStatus(
  id: string,
  action: CompanyStatusAction,
  actor: Pick<CurrentUser, "id" | "roles">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const company = await db.company.findUnique({
    where: { id },
    include: { _count: { select: { sources: true } } },
  });
  if (!company) return { ok: false, error: "This company no longer exists." };
  if (!companyActions(company.status, actor.roles).includes(action)) {
    return { ok: false, error: "That action isn't available." };
  }
  const blocker = action === "publish" ? companyPublishBlocker(company._count.sources) : null;
  if (blocker) return { ok: false, error: blocker };

  const status = STATUS_RULES[action].to;
  await db.company.update({ where: { id }, data: { status } });
  await recordAudit({
    actorId: actor.id,
    action: `company.${action}`,
    entityType: "company",
    entityId: id,
    before: { status: company.status },
    after: { status },
  });
  return { ok: true };
}

export async function markCompanyVerified(
  id: string,
  actor: CurrentUser,
  today: Date,
): Promise<void> {
  const before = await db.company.findUniqueOrThrow({ where: { id } });
  await db.company.update({ where: { id }, data: { lastVerifiedAt: today } });
  await recordAudit({
    actorId: actor.id,
    action: "company.verify",
    entityType: "company",
    entityId: id,
    before: { lastVerifiedAt: before.lastVerifiedAt.toISOString().slice(0, 10) },
    after: { lastVerifiedAt: today.toISOString().slice(0, 10) },
  });
}
