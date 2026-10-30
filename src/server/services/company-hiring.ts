import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { SectionFormInput, RoundFormInput, SourceFormInput } from "@/schemas/admin-content";
import { db } from "@/server/db";
import { PLATFORMS } from "@/server/imports/definitions/company-details";
import { recordAudit } from "@/server/services/audit";

// Editing a company's hiring process (rounds and their test sections) and sources from the
// admin panel (D-057). Like the process import, changes are live straight away: they describe
// the company, they aren't graded content. Every change is audited against the company.

type Actor = { id: string };
type Result = { ok: true; slug: string } | { ok: false; error: string; field?: string };

const MAX_ROUNDS = 20;
const MAX_SECTIONS = 20;

async function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  companyId: string,
  action: string,
  after: Prisma.InputJsonObject,
) {
  // The sitemap's "last modified" for the company page (D-058).
  await tx.company.update({ where: { id: companyId }, data: { updatedAt: new Date() } });
  await recordAudit(
    { actorId: actor.id, action, entityType: "company", entityId: companyId, after },
    tx,
  );
}

// ---------- rounds ----------

export async function saveRound(values: RoundFormInput, actor: Actor): Promise<Result> {
  if (values.platform && !(PLATFORMS as readonly string[]).includes(values.platform))
    return { ok: false, field: "platform", error: "Choose a platform from the list." };
  const company = await db.company.findUnique({
    where: { id: values.companyId },
    select: { slug: true, _count: { select: { rounds: true } } },
  });
  if (!company) return { ok: false, error: "This company no longer exists." };
  const { companyId, roundId, ...data } = values;

  if (roundId) {
    const round = await db.companyRound.findFirst({ where: { id: roundId, companyId } });
    if (!round) return { ok: false, error: "This round no longer exists." };
    await db.$transaction(async (tx) => {
      await tx.companyRound.update({ where: { id: roundId }, data });
      await audit(tx, actor, companyId, "company.round_update", { round: data.name });
    });
    return { ok: true, slug: company.slug };
  }

  if (company._count.rounds >= MAX_ROUNDS)
    return { ok: false, error: `A company can have at most ${MAX_ROUNDS} rounds.` };
  await db.$transaction(async (tx) => {
    const last = await tx.companyRound.findFirst({
      where: { companyId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    await tx.companyRound.create({ data: { ...data, companyId, order: (last?.order ?? 0) + 1 } });
    await audit(tx, actor, companyId, "company.round_add", { round: data.name });
  });
  return { ok: true, slug: company.slug };
}

export async function deleteRound(roundId: string, actor: Actor): Promise<Result> {
  const round = await db.companyRound.findUnique({
    where: { id: roundId },
    include: { company: { select: { slug: true } } },
  });
  if (!round) return { ok: false, error: "This round no longer exists." };
  await db.$transaction(async (tx) => {
    await tx.companyRound.delete({ where: { id: roundId } });
    await renumber(roundList(tx, round.companyId));
    await audit(tx, actor, round.companyId, "company.round_delete", { round: round.name });
  });
  return { ok: true, slug: round.company.slug };
}

export async function moveRound(
  roundId: string,
  direction: "up" | "down",
  actor: Actor,
): Promise<Result> {
  const round = await db.companyRound.findUnique({
    where: { id: roundId },
    include: { company: { select: { slug: true } } },
  });
  if (!round) return { ok: false, error: "This round no longer exists." };
  await db.$transaction(async (tx) => {
    if (await swapWithNeighbour(roundList(tx, round.companyId), round.id, direction))
      await audit(tx, actor, round.companyId, "company.round_move", {
        round: round.name,
        direction,
      });
  });
  return { ok: true, slug: round.company.slug };
}

// ---------- sections ----------

export async function saveSection(values: SectionFormInput, actor: Actor): Promise<Result> {
  const round = await db.companyRound.findUnique({
    where: { id: values.roundId },
    include: {
      company: { select: { id: true, slug: true } },
      _count: { select: { sections: true } },
    },
  });
  if (!round) return { ok: false, error: "This round no longer exists." };
  const topicIds = [...new Set(values.topicIds)];
  const known = await db.topic.count({ where: { id: { in: topicIds } } });
  if (known !== topicIds.length) return { ok: false, field: "topicIds", error: "Unknown topic." };

  const { roundId, sectionId, topicIds: _topics, ...data } = values;
  const topics = topicIds.map((id) => ({ id }));
  if (sectionId) {
    const section = await db.companySection.findFirst({ where: { id: sectionId, roundId } });
    if (!section) return { ok: false, error: "This section no longer exists." };
    await db.$transaction(async (tx) => {
      await tx.companySection.update({
        where: { id: sectionId },
        data: { ...data, topics: { set: topics } },
      });
      await audit(tx, actor, round.company.id, "company.section_update", { section: data.name });
    });
    return { ok: true, slug: round.company.slug };
  }

  if (round._count.sections >= MAX_SECTIONS)
    return { ok: false, error: `A round can have at most ${MAX_SECTIONS} sections.` };
  await db.$transaction(async (tx) => {
    const last = await tx.companySection.findFirst({
      where: { roundId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    await tx.companySection.create({
      data: { ...data, roundId, order: (last?.order ?? 0) + 1, topics: { connect: topics } },
    });
    await audit(tx, actor, round.company.id, "company.section_add", { section: data.name });
  });
  return { ok: true, slug: round.company.slug };
}

export async function deleteSection(sectionId: string, actor: Actor): Promise<Result> {
  const section = await db.companySection.findUnique({
    where: { id: sectionId },
    include: { round: { include: { company: { select: { id: true, slug: true } } } } },
  });
  if (!section) return { ok: false, error: "This section no longer exists." };
  await db.$transaction(async (tx) => {
    await tx.companySection.delete({ where: { id: sectionId } });
    await renumber(sectionList(tx, section.roundId));
    await audit(tx, actor, section.round.company.id, "company.section_delete", {
      section: section.name,
    });
  });
  return { ok: true, slug: section.round.company.slug };
}

export async function moveSection(
  sectionId: string,
  direction: "up" | "down",
  actor: Actor,
): Promise<Result> {
  const section = await db.companySection.findUnique({
    where: { id: sectionId },
    include: { round: { include: { company: { select: { id: true, slug: true } } } } },
  });
  if (!section) return { ok: false, error: "This section no longer exists." };
  await db.$transaction(async (tx) => {
    if (await swapWithNeighbour(sectionList(tx, section.roundId), section.id, direction))
      await audit(tx, actor, section.round.company.id, "company.section_move", {
        section: section.name,
        direction,
      });
  });
  return { ok: true, slug: section.round.company.slug };
}

// ---------- ordering (shared by rounds and sections) ----------

/** One company's rounds, or one round's sections, in order. */
type OrderedList = {
  rows(): Promise<{ id: string; order: number }[]>;
  setOrder(id: string, order: number): Promise<unknown>;
};

const ORDER = { orderBy: { order: "asc" as const }, select: { id: true, order: true } };

const roundList = (tx: Prisma.TransactionClient, companyId: string): OrderedList => ({
  rows: () => tx.companyRound.findMany({ where: { companyId }, ...ORDER }),
  setOrder: (id, order) => tx.companyRound.update({ where: { id }, data: { order } }),
});

const sectionList = (tx: Prisma.TransactionClient, roundId: string): OrderedList => ({
  rows: () => tx.companySection.findMany({ where: { roundId }, ...ORDER }),
  setOrder: (id, order) => tx.companySection.update({ where: { id }, data: { order } }),
});

/** Swaps a row with the one before or after it. False when it's already at that end. */
async function swapWithNeighbour(list: OrderedList, id: string, direction: "up" | "down") {
  const rows = await list.rows();
  const i = rows.findIndex((r) => r.id === id);
  const neighbour = rows[direction === "up" ? i - 1 : i + 1];
  const row = rows[i];
  if (!row || !neighbour) return false;
  // Orders are unique within the parent, so park the row while swapping.
  await list.setOrder(row.id, -1);
  await list.setOrder(neighbour.id, row.order);
  await list.setOrder(row.id, neighbour.order);
  return true;
}

/** Closes gaps after a delete: orders become 1, 2, 3… in their current sequence. */
async function renumber(list: OrderedList) {
  for (const [i, row] of (await list.rows()).entries())
    if (row.order !== i + 1) await list.setOrder(row.id, i + 1);
}

// ---------- sources ----------

export async function addSource(values: SourceFormInput, actor: Actor): Promise<Result> {
  const company = await db.company.findUnique({
    where: { id: values.companyId },
    select: { slug: true },
  });
  if (!company) return { ok: false, error: "This company no longer exists." };
  const duplicate = await db.companySource.findUnique({
    where: { companyId_url: { companyId: values.companyId, url: values.url } },
  });
  if (duplicate) return { ok: false, field: "url", error: "This link is already a source." };
  await db.$transaction(async (tx) => {
    await tx.companySource.create({ data: values });
    await audit(tx, actor, values.companyId, "company.source_add", { url: values.url });
  });
  return { ok: true, slug: company.slug };
}

/** Removes a source. A published company keeps at least one (D-019: every fact has a source). */
export async function deleteSource(sourceId: string, actor: Actor): Promise<Result> {
  const source = await db.companySource.findUnique({
    where: { id: sourceId },
    include: {
      company: { select: { slug: true, status: true, _count: { select: { sources: true } } } },
    },
  });
  if (!source) return { ok: false, error: "This source no longer exists." };
  if (source.company.status === "PUBLISHED" && source.company._count.sources <= 1)
    return {
      ok: false,
      error: "A published company needs at least one source. Add another one first.",
    };
  await db.$transaction(async (tx) => {
    await tx.companySource.delete({ where: { id: sourceId } });
    await audit(tx, actor, source.companyId, "company.source_delete", { url: source.url });
  });
  return { ok: true, slug: source.company.slug };
}

// ---------- copy from another company (D-067) ----------

const HAS_ROUNDS = "This company already has rounds. Delete them to copy a pattern.";

export type CopyParts = { rounds: boolean; eligibility: boolean; pay: boolean };

/**
 * Starts a company from a sister company's pattern: its rounds with their test sections and
 * topics, its eligibility rules and its pay, each optional. Never sources (every fact needs its
 * own check, D-019) or questions (link them instead). Only into a company with no rounds yet.
 */
export async function copyHiringPattern(
  fromId: string,
  toId: string,
  parts: CopyParts,
  actor: Actor,
): Promise<Result> {
  if (fromId === toId) return { ok: false, error: "Pick another company to copy from." };
  const [from, to] = await Promise.all([
    loadPattern(fromId),
    db.company.findUnique({
      where: { id: toId },
      include: { _count: { select: { rounds: true } } },
    }),
  ]);
  if (!from || !to) return { ok: false, error: "That company no longer exists." };
  if (parts.rounds && to._count.rounds) return { ok: false, error: HAS_ROUNDS };
  if (!parts.rounds && !parts.eligibility && !parts.pay)
    return { ok: false, error: "Choose what to copy." };

  try {
    await db.$transaction(async (tx) => {
      if (parts.rounds)
        for (const round of from.rounds)
          await tx.companyRound.create({
            data: {
              companyId: to.id,
              order: round.order,
              name: round.name,
              type: round.type,
              platform: round.platform,
              durationMin: round.durationMin,
              isElimination: round.isElimination,
              description: round.description,
              sections: {
                create: round.sections.map((s) => ({
                  order: s.order,
                  name: s.name,
                  type: s.type,
                  questionCount: s.questionCount,
                  minutes: s.minutes,
                  negativeMarks: s.negativeMarks,
                  canGoBack: s.canGoBack,
                  topics: { connect: s.topics.map((t) => ({ id: t.id })) },
                })),
              },
            },
          });
      await tx.company.update({
        where: { id: to.id },
        data: {
          ...(parts.eligibility && {
            minCgpa: from.minCgpa,
            min10thPercent: from.min10thPercent,
            min12thPercent: from.min12thPercent,
            maxBacklogs: from.maxBacklogs,
            maxGapYears: from.maxGapYears,
            branches: from.branches,
            gradYears: from.gradYears,
          }),
          ...(parts.pay && { ctcFresher: from.ctcFresher, ctcExperienced: from.ctcExperienced }),
        },
      });
      await audit(tx, actor, to.id, "company.copy_pattern", { from: from.slug, ...parts });
    });
  } catch (error) {
    // Two copies at once: the second meets the first's rounds (unique company + order).
    if ((error as { code?: string }).code === "P2002") return { ok: false, error: HAS_ROUNDS };
    throw error;
  }
  return { ok: true, slug: to.slug };
}

const loadPattern = (id: string) =>
  db.company.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { order: "asc" },
        include: { sections: { orderBy: { order: "asc" }, include: { topics: true } } },
      },
    },
  });
