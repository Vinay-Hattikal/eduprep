import "server-only";

// Question discussions (D-048). Students who have answered a question can read and post;
// comments go live at once and are moderated after the fact: students flag, enough flags hide a
// comment until a moderator decides, and moderators can stop a user from posting.

import { HELPFUL_VOTES } from "@/lib/engagement/badges";
import { commentProblem, sortComments, type FlagReason } from "@/lib/community/comments";
import { publicName } from "@/lib/format";
import { isAdmin } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";
import { awardBadges } from "@/server/services/engagement";
import { hit } from "@/server/services/rate-limit";
import { getSetting } from "@/server/services/settings";

type Viewer = Pick<CurrentUser, "id" | "roles">;

export type CommentView = {
  id: string;
  author: string;
  mine: boolean;
  body: string;
  voteCount: number;
  voted: boolean;
  flagged: boolean;
  createdAt: Date;
  replies: Omit<CommentView, "replies">[];
};

export type DiscussionView =
  | { status: "locked" } // answer the question first
  | { status: "open"; comments: CommentView[]; total: number; canPost: boolean };

/** Discussions can spoil the answer, so only students who answered (and admins) see them. */
async function hasAnswered(viewer: Viewer, questionId: string): Promise<boolean> {
  if (isAdmin(viewer.roles)) return true;
  const attempt = await db.attempt.findFirst({
    where: { userId: viewer.id, questionId },
    select: { id: true },
  });
  return Boolean(attempt);
}

export async function getDiscussion(viewer: Viewer, questionId: string): Promise<DiscussionView> {
  if (!(await hasAnswered(viewer, questionId))) return { status: "locked" };
  const [rows, user] = await Promise.all([
    db.questionComment.findMany({
      where: { questionId, status: "VISIBLE" },
      take: 300,
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { name: true } },
        votes: { where: { userId: viewer.id }, select: { userId: true } },
        flags: { where: { userId: viewer.id }, select: { userId: true } },
      },
    }),
    db.user.findUnique({ where: { id: viewer.id }, select: { commentsBlockedAt: true } }),
  ]);
  const view = (row: (typeof rows)[number]): Omit<CommentView, "replies"> => ({
    id: row.id,
    author: publicName(row.user.name),
    mine: row.userId === viewer.id,
    body: row.body,
    voteCount: row.voteCount,
    voted: row.votes.length > 0,
    flagged: row.flags.length > 0,
    createdAt: row.createdAt,
  });
  const ids = new Set(rows.map((r) => r.id));
  const top = sortComments(rows.filter((r) => !r.parentId));
  const comments = top.map((row) => ({
    ...view(row),
    replies: rows.filter((r) => r.parentId === row.id).map(view),
  }));
  return {
    status: "open",
    comments,
    // Replies to hidden comments aren't shown, so count only what's reachable.
    total: rows.filter((r) => !r.parentId || ids.has(r.parentId)).length,
    canPost: !user?.commentsBlockedAt,
  };
}

export type CommentResult = { ok: true } | { ok: false; error: string };

export async function postComment(
  viewer: Viewer,
  input: { questionId: string; body: string; parentId?: string | null },
): Promise<CommentResult> {
  const user = await db.user.findUnique({
    where: { id: viewer.id },
    select: { commentsBlockedAt: true },
  });
  if (user?.commentsBlockedAt)
    return { ok: false, error: "A moderator has turned off posting for your account." };
  if (!(await hasAnswered(viewer, input.questionId)))
    return { ok: false, error: "Answer the question first." };
  const problem = commentProblem(input.body);
  if (problem) return { ok: false, error: problem };

  if (input.parentId) {
    const parent = await db.questionComment.findFirst({
      where: { id: input.parentId, questionId: input.questionId, status: "VISIBLE" },
      select: { parentId: true },
    });
    if (!parent) return { ok: false, error: "That comment is no longer there." };
    if (parent.parentId) return { ok: false, error: "Reply to the main comment instead." };
  }

  const limit = await hit({ key: `comment:${viewer.id}`, limit: 10, windowSeconds: 3600 });
  if (!limit.ok) return { ok: false, error: "You've posted a lot this hour. Try again later." };

  await db.questionComment.create({
    data: {
      questionId: input.questionId,
      userId: viewer.id,
      parentId: input.parentId ?? null,
      body: input.body.trim(),
    },
  });
  return { ok: true };
}

/** Authors can remove their own comments (hidden, so replies keep their context in moderation). */
export async function deleteOwnComment(viewer: Viewer, commentId: string): Promise<CommentResult> {
  const updated = await db.questionComment.updateMany({
    where: { id: commentId, userId: viewer.id, status: "VISIBLE" },
    data: { status: "HIDDEN", hiddenReason: "Deleted by its author", flagCount: 0 },
  });
  return updated.count ? { ok: true } : { ok: false, error: "Not found." };
}

/** Upvote, or take the upvote back. The author earns "Helpful" at HELPFUL_VOTES. */
export async function toggleVote(
  viewer: Viewer,
  commentId: string,
): Promise<{ ok: true; voted: boolean; voteCount: number } | { ok: false; error: string }> {
  const comment = await db.questionComment.findFirst({
    where: { id: commentId, status: "VISIBLE" },
    select: { userId: true, questionId: true },
  });
  if (!comment) return { ok: false, error: "That comment is no longer there." };
  if (comment.userId === viewer.id) return { ok: false, error: "You can't upvote yourself." };
  if (!(await hasAnswered(viewer, comment.questionId)))
    return { ok: false, error: "Answer the question first." };

  return db.$transaction(async (tx) => {
    const key = { commentId_userId: { commentId, userId: viewer.id } };
    const existing = await tx.commentVote.findUnique({ where: key });
    if (existing) await tx.commentVote.delete({ where: key });
    else await tx.commentVote.create({ data: { commentId, userId: viewer.id } });
    const updated = await tx.questionComment.update({
      where: { id: commentId },
      data: { voteCount: { increment: existing ? -1 : 1 } },
      select: { voteCount: true },
    });
    if (!existing && updated.voteCount >= HELPFUL_VOTES)
      await awardBadges(tx, comment.userId, ["helpful"]);
    return { ok: true as const, voted: !existing, voteCount: updated.voteCount };
  });
}

export async function flagComment(
  viewer: Viewer,
  commentId: string,
  reason: FlagReason,
): Promise<CommentResult> {
  const comment = await db.questionComment.findFirst({
    where: { id: commentId, status: "VISIBLE" },
    select: { userId: true },
  });
  if (!comment) return { ok: false, error: "That comment is no longer there." };
  if (comment.userId === viewer.id) return { ok: false, error: "That's your own comment." };
  const threshold = await getSetting("discussion.autoHideFlags");

  await db.$transaction(async (tx) => {
    const created = await tx.commentFlag.createMany({
      data: [{ commentId, userId: viewer.id, reason }],
      skipDuplicates: true,
    });
    if (!created.count) return; // already flagged by this student
    const updated = await tx.questionComment.update({
      where: { id: commentId },
      data: { flagCount: { increment: 1 } },
      select: { flagCount: true, status: true },
    });
    if (threshold > 0 && updated.flagCount >= threshold && updated.status === "VISIBLE") {
      await tx.questionComment.update({
        where: { id: commentId },
        data: {
          status: "HIDDEN",
          hiddenReason: "Hidden after reports; waiting for review",
          moderatedById: null,
          moderatedAt: null,
        },
      });
    }
  });
  return { ok: true };
}

// ---------- Moderation ----------

export type ModerationFilter = "flagged" | "recent" | "hidden";

/** flagged: open flags or hidden by flags, awaiting a decision · recent: newest · hidden: removed. */
export async function listForModeration(filter: ModerationFilter = "flagged") {
  const where =
    filter === "flagged"
      ? {
          OR: [
            { status: "VISIBLE" as const, flagCount: { gt: 0 } },
            { status: "HIDDEN" as const, moderatedAt: null, flagCount: { gt: 0 } },
          ],
        }
      : filter === "hidden"
        ? { status: "HIDDEN" as const }
        : {};
  return db.questionComment.findMany({
    where,
    orderBy:
      filter === "flagged" ? [{ flagCount: "desc" }, { createdAt: "asc" }] : { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, email: true, commentsBlockedAt: true } },
      question: { select: { externalId: true, text: true } },
      flags: { select: { reason: true } },
    },
  });
}

export async function moderationCounts() {
  return {
    flagged: await db.questionComment.count({
      where: {
        OR: [
          { status: "VISIBLE", flagCount: { gt: 0 } },
          { status: "HIDDEN", moderatedAt: null, flagCount: { gt: 0 } },
        ],
      },
    }),
  };
}

/** keep: visible, flags cleared · hide: removed with a reason. */
export async function moderateComment(
  commentId: string,
  decision: "keep" | "hide",
  actor: Pick<CurrentUser, "id">,
  reason?: string,
): Promise<CommentResult> {
  const comment = await db.questionComment.findUnique({ where: { id: commentId } });
  if (!comment) return { ok: false, error: "Not found." };
  if (decision === "hide" && !reason?.trim()) return { ok: false, error: "Give a reason." };
  await db.$transaction(async (tx) => {
    await tx.questionComment.update({
      where: { id: commentId },
      data: {
        status: decision === "keep" ? "VISIBLE" : "HIDDEN",
        hiddenReason: decision === "keep" ? null : reason!.trim().slice(0, 200),
        flagCount: 0,
        moderatedById: actor.id,
        moderatedAt: new Date(),
      },
    });
    await tx.commentFlag.deleteMany({ where: { commentId } });
    await recordAudit(
      {
        actorId: actor.id,
        action: `comment.${decision}`,
        entityType: "comment",
        entityId: commentId,
        before: { status: comment.status, flags: comment.flagCount },
        after: { reason: reason ?? null },
      },
      tx,
    );
  });
  return { ok: true };
}

/** Stops (or allows again) a user posting in discussions. */
export async function setCommentBlock(
  userId: string,
  blocked: boolean,
  actor: Pick<CurrentUser, "id">,
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { commentsBlockedAt: blocked ? new Date() : null },
  });
  await recordAudit({
    actorId: actor.id,
    action: blocked ? "user.block-comments" : "user.unblock-comments",
    entityType: "user",
    entityId: userId,
  });
}
