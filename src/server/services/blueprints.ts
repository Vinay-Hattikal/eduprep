import "server-only";

import type { ContentStatus, SectionType } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/content/workflow";
import type { BlueprintForm, BlueprintSectionForm } from "@/schemas/blueprint";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";

export async function listBlueprints() {
  return db.testBlueprint.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      status: true,
      platformStyle: true,
      updatedAt: true,
      company: { select: { name: true } },
      sections: { select: { minutes: true, rules: { select: { count: true } } } },
      _count: { select: { sittings: true } },
    },
  });
}

export async function getBlueprintForm(
  id: string,
): Promise<(BlueprintForm & { status: ContentStatus }) | null> {
  const blueprint = await db.testBlueprint.findUnique({
    where: { id },
    include: { sections: { orderBy: { order: "asc" }, include: { rules: true } } },
  });
  if (!blueprint) return null;
  return {
    id: blueprint.id,
    status: blueprint.status,
    title: blueprint.title,
    slug: blueprint.slug,
    kind: blueprint.kind,
    platformStyle: blueprint.platformStyle,
    navigation: blueprint.navigation,
    description: blueprint.description,
    instructions: blueprint.instructions,
    companyId: blueprint.companyId,
    sections: blueprint.sections.map((s) => ({
      name: s.name,
      type: s.type,
      minutes: s.minutes,
      marksPerItem: s.marksPerItem,
      negativeMarks: s.negativeMarks,
      canGoBack: s.canGoBack,
      rules: s.rules.map((r) => ({ topicId: r.topicId, difficulty: r.difficulty, count: r.count })),
    })),
  };
}

/** Topics and companies for the editor's pickers. */
export async function getBlueprintOptions() {
  const [subjects, companies] = await Promise.all([
    db.subject.findMany({
      orderBy: { order: "asc" },
      select: {
        name: true,
        topics: { orderBy: { order: "asc" }, select: { id: true, name: true } },
      },
    }),
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { subjects, companies };
}

export type BlueprintSaveResult =
  { ok: true; id: string } | { ok: false; fieldErrors: Record<string, string> };

export async function saveBlueprint(
  values: BlueprintForm,
  actor: Actor,
): Promise<BlueprintSaveResult> {
  const slugOwner = await db.testBlueprint.findUnique({
    where: { slug: values.slug },
    select: { id: true },
  });
  if (slugOwner && slugOwner.id !== values.id)
    return { ok: false, fieldErrors: { slug: "This slug is already used." } };
  if (values.id) {
    const existing = await db.testBlueprint.findUnique({
      where: { id: values.id },
      select: { status: true },
    });
    if (!existing) return { ok: false, fieldErrors: { form: "This test no longer exists." } };
  }

  const { id, sections, ...data } = values;
  const saved = await db.$transaction(async (tx) => {
    const blueprint = id
      ? await tx.testBlueprint.update({
          where: { id },
          // A changed test is checked again before students see it.
          data: { ...data, status: "DRAFT" },
        })
      : await tx.testBlueprint.create({ data: { ...data, status: "DRAFT" } });
    // Sittings keep their own snapshot, so sections can be replaced freely.
    await tx.blueprintSection.deleteMany({ where: { blueprintId: blueprint.id } });
    for (const [index, section] of sections.entries()) {
      const { rules, ...fields } = section;
      await tx.blueprintSection.create({
        data: { ...fields, blueprintId: blueprint.id, order: index + 1, rules: { create: rules } },
      });
    }
    await recordAudit(
      {
        actorId: actor.id,
        action: id ? "blueprint.update" : "blueprint.create",
        entityType: "blueprint",
        entityId: blueprint.id,
      },
      tx,
    );
    return blueprint;
  });
  return { ok: true, id: saved.id };
}

/**
 * Problems with publishing: every rule must be able to draw its items from published content
 * (coding: validated problems). Rules on the same topic share the pool.
 */
export async function publishProblems(blueprintId: string): Promise<string[]> {
  const blueprint = await db.testBlueprint.findUnique({
    where: { id: blueprintId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { rules: { include: { topic: { select: { name: true } } } } },
      },
    },
  });
  if (!blueprint) return ["This test no longer exists."];
  if (!blueprint.sections.length) return ["Add at least one section."];

  const problems: string[] = [];
  const pools = new Map<string, { name: string; type: SectionType; need: number }>();
  for (const section of blueprint.sections) {
    if (!section.rules.length) problems.push(`"${section.name}" has no topic rules.`);
    for (const rule of section.rules) {
      const available = await countPool(section.type, rule.topicId, rule.difficulty);
      if (available < rule.count) {
        problems.push(
          `"${section.name}": ${rule.topic.name}${rule.difficulty ? ` (${rule.difficulty.toLowerCase()})` : ""} needs ${rule.count}, only ${available} ${section.type === "MCQ" ? "published questions" : "validated, published problems"}.`,
        );
      }
      const key = `${section.type}/${rule.topicId}`;
      const pool = pools.get(key) ?? { name: rule.topic.name, type: section.type, need: 0 };
      pool.need += rule.count;
      pools.set(key, pool);
    }
  }
  for (const [key, pool] of pools) {
    const available = await countPool(pool.type, key.split("/")[1]!, null);
    if (available < pool.need)
      problems.push(
        `${pool.name}: the test draws ${pool.need} in total but only ${available} exist.`,
      );
  }
  return problems;
}

function countPool(
  type: SectionType,
  topicId: string,
  difficulty: BlueprintSectionForm["rules"][number]["difficulty"],
) {
  return type === "MCQ"
    ? db.question.count({
        where: { status: "PUBLISHED", topicId, ...(difficulty && { difficulty }) },
      })
    : db.problem.count({
        where: {
          status: "PUBLISHED",
          validatedAt: { not: null },
          topics: { some: { id: topicId } },
          ...(difficulty && { difficulty }),
        },
      });
}

export type BlueprintAction = "publish" | "unpublish" | "archive" | "restore";

export async function transitionBlueprint(id: string, action: BlueprintAction, actor: Actor) {
  const blueprint = await db.testBlueprint.findUnique({ where: { id }, select: { status: true } });
  if (!blueprint) return { ok: false as const, errors: ["This test no longer exists."] };
  if (action === "publish") {
    const problems = await publishProblems(id);
    if (problems.length) return { ok: false as const, errors: problems };
  }
  const status: ContentStatus =
    action === "publish" ? "PUBLISHED" : action === "archive" ? "ARCHIVED" : "DRAFT";
  await db.$transaction(async (tx) => {
    await tx.testBlueprint.update({ where: { id }, data: { status } });
    await recordAudit(
      {
        actorId: actor.id,
        action: `blueprint.${action}`,
        entityType: "blueprint",
        entityId: id,
        before: { status: blueprint.status },
        after: { status },
      },
      tx,
    );
  });
  return { ok: true as const };
}

/**
 * A starting blueprint that mirrors a company's online test (rounds → sections → topics).
 * Each section's question count is split evenly across its topics.
 */
export async function draftFromCompany(companyId: string): Promise<BlueprintForm | null> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    include: {
      rounds: {
        where: { type: { in: ["ONLINE_TEST", "CODING_TEST"] } },
        orderBy: { order: "asc" },
        include: {
          sections: { orderBy: { order: "asc" }, include: { topics: { select: { id: true } } } },
        },
      },
    },
  });
  if (!company) return null;
  const sections = company.rounds.flatMap((round) =>
    round.sections
      .filter((s) => s.topics.length > 0)
      .map((s) => {
        const per = Math.floor(s.questionCount / s.topics.length);
        const extra = s.questionCount % s.topics.length;
        return {
          name: s.name,
          type: s.type,
          minutes: s.minutes,
          marksPerItem: 1,
          negativeMarks: s.negativeMarks,
          canGoBack: s.canGoBack,
          rules: s.topics
            .map((t, i) => ({ topicId: t.id, difficulty: null, count: per + (i < extra ? 1 : 0) }))
            .filter((r) => r.count > 0),
        };
      }),
  );
  return {
    title: `${company.name} mock test`,
    slug: `${company.slug}-mock`,
    kind: "COMPANY_MOCK",
    platformStyle: "GENERIC",
    navigation: "SEQUENTIAL",
    description: `Full-length mock in ${company.name}'s current test format.`,
    instructions: null,
    companyId: company.id,
    sections,
  };
}
