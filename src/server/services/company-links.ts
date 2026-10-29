import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AskedAt } from "@/lib/content/asked-at";
import { nextExternalId } from "@/lib/content/asked-at";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";

// Linking questions and coding problems to companies from the admin panel (D-057). A link says
// "this company asks it", with optional months. Links don't change the item itself, so they
// never send it back to draft (same as D-054 for imports).

type Actor = { id: string };
type Item = { questionId: string } | { problemId: string };

/** Company pages list their questions, so their sitemap date moves when links change (D-058). */
async function touchCompanies(tx: Prisma.TransactionClient, ids: readonly string[]) {
  if (ids.length)
    await tx.company.updateMany({
      where: { id: { in: [...ids] } },
      data: { updatedAt: new Date() },
    });
}

/** Touches every company page that lists this item (when it's published or unpublished). */
export async function touchCompaniesListing(tx: Prisma.TransactionClient, item: Item) {
  await tx.company.updateMany({
    where: { items: { some: itemWhere(item) } },
    data: { updatedAt: new Date() },
  });
}

const itemWhere = (item: Item) =>
  "questionId" in item ? { questionId: item.questionId } : { problemId: item.problemId };

/** Every company, for the "Asked at" pickers. */
export async function companyOptions() {
  return db.company.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

/** Null when every company exists, else the error to show. */
export async function companyLinksProblem(links: readonly AskedAt[]): Promise<string | null> {
  if (!links.length) return null;
  const found = await db.company.count({ where: { id: { in: links.map((l) => l.companyId) } } });
  return found === links.length ? null : "One of the companies no longer exists.";
}

/**
 * Makes the item's company links exactly `links`. Kept links keep their round and report count;
 * their months are replaced by what the editor shows. False when nothing changed.
 */
export async function setCompanyLinks(item: Item, links: readonly AskedAt[], actor: Actor) {
  const where = itemWhere(item);
  return db.$transaction(async (tx) => {
    const existing = new Map(
      (await tx.companyItem.findMany({ where })).map((e) => [e.companyId, e]),
    );
    const keep = new Set(links.map((l) => l.companyId));
    const removed = [...existing.values()].filter((e) => !keep.has(e.companyId));
    const created = links.filter((l) => !existing.has(l.companyId));
    const updated = links.filter((l) => {
      const before = existing.get(l.companyId);
      return before && before.askedIn.join() !== l.askedIn.join();
    });
    if (!removed.length && !created.length && !updated.length) return false;

    if (removed.length)
      await tx.companyItem.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
    if (created.length)
      await tx.companyItem.createMany({
        data: created.map((l) => ({ companyId: l.companyId, ...where, askedIn: l.askedIn })),
      });
    for (const l of updated)
      await tx.companyItem.update({
        where: { id: existing.get(l.companyId)!.id },
        data: { askedIn: l.askedIn },
      });

    await touchCompanies(tx, [
      ...new Set([...removed, ...created, ...updated].map((l) => l.companyId)),
    ]);
    const [entityType, entityId] =
      "questionId" in item ? ["question", item.questionId] : ["problem", item.problemId];
    await recordAudit(
      {
        actorId: actor.id,
        action: `${entityType}.companies`,
        entityType,
        entityId,
        after: { companies: links.map((l) => ({ companyId: l.companyId, askedIn: l.askedIn })) },
      },
      tx,
    );
    return true;
  });
}

/** Links an existing question or problem to a company (no months). */
export async function linkToCompany(companyId: string, item: Item, actor: Actor) {
  const where = itemWhere(item);
  const already = await db.companyItem.findFirst({ where: { companyId, ...where } });
  if (already) return;
  await db.$transaction(async (tx) => {
    await tx.companyItem.create({ data: { companyId, ...where } });
    await touchCompanies(tx, [companyId]);
    await recordAudit(
      {
        actorId: actor.id,
        action: "company.link",
        entityType: "company",
        entityId: companyId,
        after: where,
      },
      tx,
    );
  });
}

export async function unlinkFromCompany(companyItemId: string, actor: Actor) {
  const link = await db.companyItem.findUnique({ where: { id: companyItemId } });
  if (!link) return null;
  await db.$transaction(async (tx) => {
    await tx.companyItem.delete({ where: { id: link.id } });
    await touchCompanies(tx, [link.companyId]);
    await recordAudit(
      {
        actorId: actor.id,
        action: "company.unlink",
        entityType: "company",
        entityId: link.companyId,
        before: { questionId: link.questionId, problemId: link.problemId },
      },
      tx,
    );
  });
  return link.companyId;
}

/** Questions or problems not yet linked to the company, matching an ID or text. */
export async function searchLinkable(companyId: string, kind: "question" | "problem", q: string) {
  const text = q.trim().slice(0, 100);
  if (!text) return [];
  if (kind === "question") {
    return db.question.findMany({
      where: {
        status: { not: "ARCHIVED" },
        companies: { none: { companyId } },
        OR: [
          { externalId: { contains: text, mode: "insensitive" } },
          { text: { contains: text, mode: "insensitive" } },
        ],
      },
      orderBy: { externalId: "asc" },
      take: 20,
      select: {
        id: true,
        externalId: true,
        text: true,
        status: true,
        topic: { select: { name: true } },
      },
    });
  }
  return db.problem.findMany({
    where: {
      status: { not: "ARCHIVED" },
      companies: { none: { companyId } },
      OR: [
        { externalId: { contains: text, mode: "insensitive" } },
        { title: { contains: text, mode: "insensitive" } },
      ],
    },
    orderBy: { externalId: "asc" },
    take: 20,
    select: { id: true, externalId: true, title: true, status: true, difficulty: true },
  });
}

/** The next unused question ID after `id` (QA-PCT-0042 → QA-PCT-0043), or "". */
export async function suggestNextQuestionId(id: string): Promise<string> {
  // The next 50 IDs in sequence, checked in one query.
  const candidates: string[] = [];
  for (let next = nextExternalId(id); next && candidates.length < 50; next = nextExternalId(next))
    candidates.push(next);
  const taken = new Set(
    (
      await db.question.findMany({
        where: { externalId: { in: candidates } },
        select: { externalId: true },
      })
    ).map((q) => q.externalId),
  );
  return candidates.find((c) => !taken.has(c)) ?? "";
}
