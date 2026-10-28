import "server-only";

import type { ContentStatus, DesignKind, Difficulty } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/content/workflow";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";

export type DesignValues = {
  id?: string;
  externalId: string;
  slug: string;
  kind: DesignKind;
  title: string;
  difficulty: Difficulty;
  prompt: string;
  requirements: string;
  approach: string;
  tradeoffs: string;
  followUps: string | null;
  companies: string[];
  tracks: string[];
};

export type DesignSaveResult =
  | { ok: true; id: string; created: boolean; movedToDraft: boolean }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

export async function getAdminDesignQuestion(id: string) {
  return db.designQuestion.findUnique({ where: { id } });
}

/** Role tracks and company slugs the form offers or checks against. */
export async function designFormOptions() {
  const [tracks, companies] = await Promise.all([
    db.roleTrack.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { slug: true, name: true },
    }),
    db.company.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
  ]);
  return { tracks, companies };
}

/**
 * Creates a draft design question or updates one. Like every content edit, a changed question
 * leaves the student pages until a reviewer publishes it again (D-010, D-031).
 */
export async function saveDesignQuestion(
  values: DesignValues,
  actor: Actor,
): Promise<DesignSaveResult> {
  const [before, sameId, sameSlug, companies, tracks] = await Promise.all([
    values.id ? db.designQuestion.findUnique({ where: { id: values.id } }) : null,
    db.designQuestion.findUnique({
      where: { externalId: values.externalId },
      select: { id: true },
    }),
    db.designQuestion.findUnique({ where: { slug: values.slug }, select: { id: true } }),
    db.company.findMany({ where: { slug: { in: values.companies } }, select: { slug: true } }),
    db.roleTrack.findMany({ where: { slug: { in: values.tracks } }, select: { slug: true } }),
  ]);
  if (values.id && !before)
    return { ok: false, fieldErrors: {}, formError: "This question no longer exists." };

  const fieldErrors: Record<string, string> = {};
  if (sameId && sameId.id !== values.id) fieldErrors.externalId = "This ID is already used.";
  if (sameSlug && sameSlug.id !== values.id) fieldErrors.slug = "This URL slug is already used.";
  const known = new Set(companies.map((c) => c.slug));
  const unknown = values.companies.filter((slug) => !known.has(slug));
  if (unknown.length) fieldErrors.companies = `Not companies: ${unknown.join(", ")}.`;
  if (tracks.length !== new Set(values.tracks).size) fieldErrors.tracks = "Unknown role track.";
  if (Object.keys(fieldErrors).length)
    return { ok: false, fieldErrors, formError: "Fix the highlighted fields." };

  const { id: _id, ...data } = values;
  if (!before) {
    const created = await db.$transaction(async (tx) => {
      const question = await tx.designQuestion.create({ data: { ...data, status: "DRAFT" } });
      await recordAudit(
        {
          actorId: actor.id,
          action: "design.create",
          entityType: "design_question",
          entityId: question.id,
          after: { externalId: question.externalId },
        },
        tx,
      );
      return question;
    });
    return { ok: true, id: created.id, created: true, movedToDraft: false };
  }

  const changed = (Object.keys(data) as (keyof typeof data)[]).filter(
    (key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(data[key] ?? null),
  );
  if (!changed.length) return { ok: true, id: before.id, created: false, movedToDraft: false };
  const movedToDraft = before.status === "PUBLISHED";
  await db.$transaction(async (tx) => {
    await tx.designQuestion.update({
      where: { id: before.id },
      // Archived questions stay archived until restored; everything else becomes a draft.
      data: { ...data, ...(before.status !== "ARCHIVED" && { status: "DRAFT" }) },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "design.update",
        entityType: "design_question",
        entityId: before.id,
        after: { changed },
      },
      tx,
    );
  });
  return { ok: true, id: before.id, created: false, movedToDraft };
}

export async function setDesignStatus(id: string, status: ContentStatus, actor: Actor) {
  const before = await db.designQuestion.findUnique({ where: { id }, select: { status: true } });
  if (!before || before.status === status) return;
  await db.$transaction(async (tx) => {
    await tx.designQuestion.update({ where: { id }, data: { status } });
    await recordAudit(
      {
        actorId: actor.id,
        action: `design.${status.toLowerCase()}`,
        entityType: "design_question",
        entityId: id,
        before: { status: before.status },
        after: { status },
      },
      tx,
    );
  });
}
