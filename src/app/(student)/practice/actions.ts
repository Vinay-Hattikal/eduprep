"use server";

import { z } from "zod";
import { OPTION_LETTERS } from "@/lib/content/question-rules";
import { COMMENT_MAX, FLAG_REASONS, type FlagReason } from "@/lib/community/comments";
import { requirePermission } from "@/server/auth";
import {
  deleteOwnComment,
  flagComment,
  getDiscussion,
  postComment,
  toggleVote,
  type CommentResult,
  type DiscussionView,
} from "@/server/services/discussions";
import {
  nextQuestion,
  PRACTICE_SOURCES,
  reportError,
  submitAnswer,
  toggleBookmark,
  type AnswerResult,
  type PracticeFilter,
  type StudentQuestion,
} from "@/server/services/practice";

const filterSchema = z.object({
  subject: z.string().max(80).optional(),
  topic: z.string().max(80).optional(),
  subtopic: z.string().max(80).optional(),
  company: z.string().max(80).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  source: z.enum(PRACTICE_SOURCES),
});

const answerSchema = z.object({
  questionId: z.string().min(1).max(40),
  selectedOptions: z.array(z.enum(OPTION_LETTERS)).max(5),
  numericAnswer: z.number().finite().nullable(),
  timeSec: z.number().int().min(0).max(3600),
  mode: z.enum(["PRACTICE", "RETRY", "DAILY"]),
});

export async function submitAnswerAction(
  input: z.input<typeof answerSchema>,
): Promise<AnswerResult> {
  const user = await requirePermission("student.access");
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { status: "not-found" };
  return submitAnswer(user, {
    ...parsed.data,
    selectedOptions: [...new Set(parsed.data.selectedOptions)],
  });
}

export async function nextQuestionAction(
  filter: PracticeFilter,
  exclude: string[],
): Promise<StudentQuestion | null> {
  const user = await requirePermission("student.access");
  const parsed = filterSchema.safeParse(filter);
  if (!parsed.success) return null;
  return nextQuestion(
    user.id,
    parsed.data,
    z.array(z.string().max(40)).max(500).catch([]).parse(exclude),
  );
}

export async function toggleBookmarkAction(questionId: string): Promise<boolean> {
  const user = await requirePermission("student.access");
  return toggleBookmark(user.id, z.string().max(40).parse(questionId));
}

const reportSchema = z.object({
  questionId: z.string().min(1).max(40),
  reason: z.enum(["WRONG_ANSWER", "WRONG_EXPLANATION", "TYPO", "UNCLEAR", "OTHER"]),
  message: z.string().trim().min(5, "Tell us a little more (at least 5 characters).").max(1000),
});

export async function reportErrorAction(
  input: z.input<typeof reportSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission("student.access");
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your report." };
  return reportError(user.id, parsed.data);
}

// ---------- Discussions (D-048) ----------

const idSchema = z.string().min(1).max(40);

export async function loadDiscussionAction(questionId: string): Promise<DiscussionView> {
  const user = await requirePermission("student.access");
  return getDiscussion(user, idSchema.parse(questionId));
}

const commentSchema = z.object({
  questionId: idSchema,
  body: z.string().max(COMMENT_MAX + 100),
  parentId: idSchema.nullable().optional(),
});

export async function postCommentAction(
  input: z.input<typeof commentSchema>,
): Promise<CommentResult> {
  const user = await requirePermission("student.access");
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your comment." };
  return postComment(user, parsed.data);
}

export async function voteCommentAction(commentId: string) {
  const user = await requirePermission("student.access");
  return toggleVote(user, idSchema.parse(commentId));
}

export async function flagCommentAction(
  commentId: string,
  reason: FlagReason,
): Promise<CommentResult> {
  const user = await requirePermission("student.access");
  const parsed = z
    .enum(Object.keys(FLAG_REASONS) as [FlagReason, ...FlagReason[]])
    .safeParse(reason);
  if (!parsed.success) return { ok: false, error: "Choose a reason." };
  return flagComment(user, idSchema.parse(commentId), parsed.data);
}

export async function deleteCommentAction(commentId: string): Promise<CommentResult> {
  const user = await requirePermission("student.access");
  return deleteOwnComment(user, idSchema.parse(commentId));
}
