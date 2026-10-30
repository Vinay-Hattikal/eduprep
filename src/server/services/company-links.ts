import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AskedAt } from "@/lib/content/asked-at";
import { nextExternalId } from "@/lib/content/asked-at";
import { INTERVIEW_ROUND_TYPES } from "@/lib/content/companies";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";

// Linking questions, coding problems and design/interview questions to companies from the admin
// panel (D-057, D-067). A link says "this company asks it", with optional months and round.
// Links don't change the item itself, so they never send it back to draft (same as D-054).

type Actor = { id: string };

/** Each kind of linked item, its company_items column and its audit entity type. */
const KINDS = {
  question: { field: "questionId", entity: "question" },
  problem: { field: "problemId", entity: "problem" },
  design: { field: "designQuestionId", entity: "design_question" },
} as const;

export type LinkKind = keyof typeof KINDS;
export type Item = {
  [K in LinkKind]: Record<(typeof KINDS)[K]["field"], string>;
}[LinkKind];

/** The link for an item of this kind and id. */
export const linkItem = (kind: LinkKind, id: string) => ({ [KINDS[kind].field]: id }) as Item;

/** The entity type and id of an item, for audit entries. */
function describe(item: Item): [string, string] {
  const kind = Object.values(KINDS).find((k) => k.field in item)!;
  return [kind.entity, (item as Record<string, string>)[kind.field]!];
}

/** Company pages list their questions, so their sitemap date moves when links change (D-058). */
async function touchCompanies(tx: Prisma.TransactionClient, ids: readonly string[]) {
  if (ids.length)
    await tx.company.updateMany({
      where: { id: { in: [...ids] } },
      data: { updatedAt: new Date() },
    });
}

/** Touches every company page that lists these items (when they're published or unpublished). */
export async function touchCompaniesListing(
  tx: Prisma.TransactionClient,
  items: Prisma.CompanyItemWhereInput,
) {
  await tx.company.updateMany({
    where: { items: { some: items } },
    data: { updatedAt: new Date() },
  });
}

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
export async function setCompanyLinks(
  item: Item,
  links: readonly AskedAt[],
  actor: Actor,
  tx?: Prisma.TransactionClient,
): Promise<boolean> {
  if (!tx) return db.$transaction((t) => setCompanyLinks(item, links, actor, t));
  const existing = new Map(
    (await tx.companyItem.findMany({ where: item })).map((e) => [e.companyId, e]),
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
      data: created.map((l) => ({ companyId: l.companyId, ...item, askedIn: l.askedIn })),
    });
  for (const l of updated)
    await tx.companyItem.update({
      where: { id: existing.get(l.companyId)!.id },
      data: { askedIn: l.askedIn },
    });

  await touchCompanies(tx, [
    ...new Set([...removed, ...created, ...updated].map((l) => l.companyId)),
  ]);
  const [entityType, entityId] = describe(item);
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
}

/** Links an existing question or problem to a company (no months). */
export async function linkToCompany(companyId: string, item: Item, actor: Actor) {
  const already = await db.companyItem.findFirst({ where: { companyId, ...item } });
  if (already) return;
  await db.$transaction(async (tx) => {
    await tx.companyItem.create({ data: { companyId, ...item } });
    await touchCompanies(tx, [companyId]);
    await recordAudit(
      {
        actorId: actor.id,
        action: "company.link",
        entityType: "company",
        entityId: companyId,
        after: item,
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
        before: {
          questionId: link.questionId,
          problemId: link.problemId,
          designQuestionId: link.designQuestionId,
        },
      },
      tx,
    );
  });
  return link.companyId;
}

/** Items of this kind not yet linked to the company, matching an ID or text. */
export async function searchLinkable(companyId: string, kind: LinkKind, q: string) {
  const text = q.trim().slice(0, 100);
  if (!text) return [];
  const where = (textField: "text" | "title") => ({
    status: { not: "ARCHIVED" as const },
    companies: { none: { companyId } },
    OR: [
      { externalId: { contains: text, mode: "insensitive" as const } },
      { [textField]: { contains: text, mode: "insensitive" as const } },
    ],
  });
  const page = { orderBy: { externalId: "asc" as const }, take: 20 };
  const fields = { id: true, externalId: true, status: true } as const;
  if (kind === "question")
    return db.question.findMany({
      where: where("text"),
      ...page,
      select: { ...fields, text: true },
    });
  if (kind === "problem")
    return db.problem.findMany({
      where: where("title"),
      ...page,
      select: { ...fields, title: true },
    });
  return db.designQuestion.findMany({
    where: where("title"),
    ...page,
    select: { ...fields, title: true },
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

/**
 * The interview round an interview question is asked in (null: not tied to one, D-067). False
 * when the round isn't one of this company's interview rounds.
 */
export async function setLinkRound(
  linkId: string,
  companyId: string,
  roundId: string | null,
  actor: Actor,
): Promise<boolean> {
  if (
    roundId !== null &&
    !(await db.companyRound.count({
      where: { id: roundId, companyId, type: { in: [...INTERVIEW_ROUND_TYPES] } },
    }))
  )
    return false;
  return db.$transaction(async (tx) => {
    const moved = await tx.companyItem.updateMany({
      where: { id: linkId, companyId },
      data: { roundId },
    });
    if (!moved.count) return false;
    await touchCompanies(tx, [companyId]);
    await recordAudit(
      {
        actorId: actor.id,
        action: "company.link_round",
        entityType: "company",
        entityId: companyId,
        after: { linkId, roundId },
      },
      tx,
    );
    return true;
  });
}

/** Links many items of one kind to a company, keeping their other links ("Import for", D-067). */
export async function linkManyToCompany(
  companyId: string,
  kind: LinkKind,
  ids: readonly string[],
  actorId: string | null,
) {
  if (!ids.length) return;
  await db.$transaction(async (tx) => {
    const created = await tx.companyItem.createMany({
      data: ids.map((id) => ({ companyId, ...linkItem(kind, id) })),
      skipDuplicates: true,
    });
    await touchCompanies(tx, [companyId]);
    await recordAudit(
      {
        actorId,
        action: "company.link",
        entityType: "company",
        entityId: companyId,
        after: { kind, linked: created.count },
      },
      tx,
    );
  });
}

/** A company list read through company_items, as slugs (design questions, imports). */
export const COMPANY_SLUGS = { select: { company: { select: { slug: true } } } } as const;
export const companySlugs = (links: readonly { company: { slug: string } }[]) =>
  links.map((l) => l.company.slug);
