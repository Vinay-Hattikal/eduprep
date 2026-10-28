import "server-only";

// Share cards (D-053): a student chooses to share a result or badge; we freeze what it shows
// into a public card with an unguessable link. Nothing is public until they ask, and they can
// turn the link off.

import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { ShareKind } from "@/generated/prisma/enums";
import { BADGES, isBadgeId } from "@/lib/engagement/badges";
import { SHARE_ID, type ShareCardData } from "@/lib/engagement/share";
import { publicName } from "@/lib/format";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { standing } from "@/server/services/contests";

type Viewer = Pick<CurrentUser, "id" | "name">;

export type ShareResult = { ok: true; id: string } | { ok: false; error: string };

const day = (date: Date) => date.toISOString().slice(0, 10);

async function cardData(
  viewer: Viewer,
  kind: ShareKind,
  refId: string,
): Promise<ShareCardData | string> {
  const name = publicName(viewer.name);
  if (kind === "BADGE") {
    if (!isBadgeId(refId)) return "Unknown badge.";
    const earned = await db.userBadge.findUnique({
      where: { userId_badge: { userId: viewer.id, badge: refId } },
    });
    if (!earned) return "You haven't earned this badge yet.";
    const badge = BADGES[refId];
    return {
      name,
      title: badge.name,
      headline: "Badge earned",
      detail: badge.description,
      date: day(earned.earnedAt),
    };
  }

  const sitting = await db.testSitting.findFirst({
    where: { id: refId, userId: viewer.id, status: "SUBMITTED" },
    select: {
      score: true,
      maxScore: true,
      submittedAt: true,
      startedAt: true,
      contestId: true,
      contest: { select: { title: true, finalizedAt: true } },
      blueprint: { select: { title: true } },
    },
  });
  if (!sitting) return "Result not found.";

  if (kind === "CONTEST") {
    if (!sitting.contestId || !sitting.contest) return "This isn't an All-India mock result.";
    if (!sitting.contest.finalizedAt) return "Share your rank once the results are final.";
    const result = await standing(sitting.contestId, viewer.id);
    if (!result) return "Result not found.";
    return {
      name,
      title: sitting.contest.title,
      headline: `All-India rank ${result.rank.toLocaleString("en-IN")} of ${result.total.toLocaleString("en-IN")}`,
      detail: `${result.percentile} percentile`,
      date: day(sitting.submittedAt ?? sitting.startedAt),
    };
  }

  const score = sitting.score ?? 0;
  const max = sitting.maxScore ?? 0;
  return {
    name,
    title: sitting.blueprint.title,
    headline: `Scored ${score} / ${max}`,
    detail: max ? `${Math.round((Math.max(0, score) / max) * 100)}%` : null,
    date: day(sitting.submittedAt ?? sitting.startedAt),
  };
}

/** Creates the card, or refreshes and re-enables the student's existing one for the same thing. */
export async function createShareCard(
  viewer: Viewer,
  kind: ShareKind,
  refId: string,
): Promise<ShareResult> {
  const data = await cardData(viewer, kind, refId);
  if (typeof data === "string") return { ok: false, error: data };
  const json = data as unknown as Prisma.InputJsonValue;
  const key = { userId_kind_refId: { userId: viewer.id, kind, refId } };
  const existing = await db.shareCard.findUnique({ where: key, select: { id: true } });
  if (existing) {
    await db.shareCard.update({ where: key, data: { data: json, revokedAt: null } });
    return { ok: true, id: existing.id };
  }
  const id = randomBytes(9).toString("base64url");
  await db.shareCard.create({ data: { id, userId: viewer.id, kind, refId, data: json } });
  return { ok: true, id };
}

/** A live card for its public page, or null (unknown, malformed or turned off). */
export async function getShareCard(id: string) {
  if (!SHARE_ID.test(id)) return null;
  const card = await db.shareCard.findUnique({ where: { id } });
  if (!card || card.revokedAt) return null;
  return { id: card.id, kind: card.kind, data: card.data as unknown as ShareCardData };
}

export async function revokeShareCard(viewer: Pick<CurrentUser, "id">, id: string) {
  const updated = await db.shareCard.updateMany({
    where: { id, userId: viewer.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return updated.count > 0;
}

export async function listMyShareCards(userId: string) {
  return db.shareCard.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
