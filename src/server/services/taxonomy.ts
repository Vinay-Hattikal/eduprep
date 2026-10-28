import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens.");
const name = z.string().trim().min(1, "Required.").max(120, "Too long.");
const order = z.coerce.number().int("Whole number.").min(0, "Can't be negative.").max(10_000);

export const createNodeSchema = z.object({ slug, name });
export const updateNodeSchema = z.object({ name, order });

export type TaxonomyLevel = "subject" | "topic" | "subtopic";
export type TaxonomyResult = { ok: true } | { ok: false; error: string };

export async function getTaxonomyAdmin() {
  return db.subject.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { questions: true } },
      topics: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
        include: {
          _count: { select: { questions: true } },
          subtopics: {
            orderBy: [{ order: "asc" }, { name: "asc" }],
            include: { _count: { select: { questions: true } } },
          },
        },
      },
    },
  });
}

/** Adds a subject, a topic (parentId = subject) or a subtopic (parentId = topic). */
export async function createTaxonomyNode(
  level: TaxonomyLevel,
  parentId: string | null,
  input: { slug: string; name: string },
  actorId: string,
): Promise<TaxonomyResult> {
  if (level === "subject") {
    if (await db.subject.findUnique({ where: { slug: input.slug } }))
      return { ok: false, error: "This slug is already used." };
    const created = await db.subject.create({
      data: { ...input, order: await db.subject.count() },
    });
    await recordAudit({
      actorId,
      action: "subject.create",
      entityType: "subject",
      entityId: created.id,
      after: input,
    });
    return { ok: true };
  }
  if (!parentId) return { ok: false, error: "Missing parent." };

  if (level === "topic") {
    // Topic slugs are unique across all subjects (D-025).
    if (await db.topic.findUnique({ where: { slug: input.slug } })) {
      return {
        ok: false,
        error: "This topic slug is already used (topic slugs are unique across subjects).",
      };
    }
    const created = await db.topic.create({
      data: {
        ...input,
        subjectId: parentId,
        order: await db.topic.count({ where: { subjectId: parentId } }),
      },
    });
    await recordAudit({
      actorId,
      action: "topic.create",
      entityType: "topic",
      entityId: created.id,
      after: input,
    });
    return { ok: true };
  }

  if (
    await db.subtopic.findUnique({
      where: { topicId_slug: { topicId: parentId, slug: input.slug } },
    })
  ) {
    return { ok: false, error: "This topic already has a subtopic with that slug." };
  }
  const created = await db.subtopic.create({
    data: {
      ...input,
      topicId: parentId,
      order: await db.subtopic.count({ where: { topicId: parentId } }),
    },
  });
  await recordAudit({
    actorId,
    action: "subtopic.create",
    entityType: "subtopic",
    entityId: created.id,
    after: input,
  });
  return { ok: true };
}

/** Renames or reorders a node. Slugs never change: imports refer to them. */
export async function updateTaxonomyNode(
  level: TaxonomyLevel,
  id: string,
  input: { name: string; order: number },
  actorId: string,
): Promise<TaxonomyResult> {
  const before =
    level === "subject"
      ? await db.subject.findUnique({ where: { id } })
      : level === "topic"
        ? await db.topic.findUnique({ where: { id } })
        : await db.subtopic.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "Not found." };
  if (before.name === input.name && before.order === input.order) return { ok: true };

  if (level === "subject") await db.subject.update({ where: { id }, data: input });
  else if (level === "topic") await db.topic.update({ where: { id }, data: input });
  else await db.subtopic.update({ where: { id }, data: input });

  await recordAudit({
    actorId,
    action: `${level}.update`,
    entityType: level,
    entityId: id,
    before: { name: before.name, order: before.order },
    after: input,
  });
  return { ok: true };
}
