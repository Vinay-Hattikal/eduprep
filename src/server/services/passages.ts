import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/content/workflow";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";

// Passages are shared text (reading passages, data tables) that questions point to. They have
// no review status of their own: an edit shows in every question that uses it straight away,
// exactly as a passage re-import does (D-055).

export const PASSAGE_PAGE_SIZE = 25;

export async function listPassages({ q, page }: { q?: string; page: number }) {
  const where: Prisma.PassageWhereInput = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { externalId: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    db.passage.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PASSAGE_PAGE_SIZE,
      take: PASSAGE_PAGE_SIZE,
      select: {
        id: true,
        externalId: true,
        title: true,
        updatedAt: true,
        _count: { select: { questions: true } },
      },
    }),
    db.passage.count({ where }),
  ]);
  return { rows, total };
}

export async function getAdminPassage(id: string) {
  return db.passage.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { externalId: "asc" },
        select: { id: true, externalId: true, text: true, status: true },
      },
    },
  });
}

export type PassageValues = { id?: string; externalId: string; title: string; body: string };

export type PassageSaveResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

export async function savePassage(values: PassageValues, actor: Actor): Promise<PassageSaveResult> {
  const body = values.body.replace(/\r\n/g, "\n");
  const [before, sameId] = await Promise.all([
    values.id ? db.passage.findUnique({ where: { id: values.id } }) : null,
    db.passage.findUnique({ where: { externalId: values.externalId }, select: { id: true } }),
  ]);
  if (values.id && !before)
    return { ok: false, fieldErrors: {}, formError: "This passage no longer exists." };
  // Questions and import files refer to passages by ID, so it stays fixed.
  if (before && before.externalId !== values.externalId)
    return { ok: false, fieldErrors: { externalId: "The ID can't be changed." } };
  if (sameId && sameId.id !== values.id)
    return { ok: false, fieldErrors: { externalId: "This ID is already used." } };
  if (before && before.title === values.title && before.body === body)
    return { ok: true, id: before.id, created: false };

  const saved = await db.$transaction(async (tx) => {
    const passage = before
      ? await tx.passage.update({
          where: { id: before.id },
          data: { title: values.title, body },
        })
      : await tx.passage.create({
          data: { externalId: values.externalId, title: values.title, body },
        });
    await recordAudit(
      {
        actorId: actor.id,
        action: before ? "passage.update" : "passage.create",
        entityType: "passage",
        entityId: passage.id,
        ...(before && { before: { title: before.title, body: before.body } }),
        after: { title: passage.title },
      },
      tx,
    );
    return passage;
  });
  return { ok: true, id: saved.id, created: !before };
}

/** Deletes a passage no question uses. Used passages stay, because questions show them. */
export async function deletePassage(
  id: string,
  actor: Actor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return db.$transaction(async (tx) => {
    const passage = await tx.passage.findUnique({
      where: { id },
      include: { _count: { select: { questions: true } } },
    });
    if (!passage) return { ok: true };
    if (passage._count.questions)
      return { ok: false, error: "Questions use this passage, so it can't be deleted." };
    await tx.passage.delete({ where: { id } });
    await recordAudit(
      {
        actorId: actor.id,
        action: "passage.delete",
        entityType: "passage",
        entityId: id,
        before: { externalId: passage.externalId, title: passage.title, body: passage.body },
      },
      tx,
    );
    return { ok: true };
  });
}
