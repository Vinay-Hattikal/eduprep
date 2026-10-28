// Review workflow rules (PRD 9.4): Draft -> In review -> Published -> Archived.
// Pure, so the rules are unit-tested and shared by the UI (which buttons to show) and the server.

import type { ContentStatus, Difficulty, Role } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";

export type QuestionAction = "submit" | "approve" | "reject" | "archive" | "restore";

export const STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const ACTION_LABELS: Record<QuestionAction, string> = {
  submit: "Submit for review",
  approve: "Approve and publish",
  reject: "Send back to draft",
  archive: "Archive",
  restore: "Restore to draft",
};

const TRANSITIONS: Record<QuestionAction, { from: ContentStatus[]; to: ContentStatus }> = {
  submit: { from: ["DRAFT"], to: "IN_REVIEW" },
  approve: { from: ["IN_REVIEW"], to: "PUBLISHED" },
  reject: { from: ["IN_REVIEW"], to: "DRAFT" },
  archive: { from: ["DRAFT", "IN_REVIEW", "PUBLISHED"], to: "ARCHIVED" },
  restore: { from: ["ARCHIVED"], to: "DRAFT" },
};

export type Actor = { id: string; roles: readonly Role[] };

/** Null when allowed, otherwise the reason shown to the admin. */
export function transitionBlocker(
  action: QuestionAction,
  status: ContentStatus,
  actor: Actor,
  authorId: string | null,
): string | null {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(status)) {
    return `Can't ${ACTION_LABELS[action].toLowerCase()} a question that is ${STATUS_LABELS[status].toLowerCase()}.`;
  }
  if (action === "submit") {
    return can(actor.roles, "content.edit") ? null : "You can't edit content.";
  }
  if (!can(actor.roles, "content.publish")) return "Only reviewers can do this.";
  // Blind review: reviewers don't approve their own questions. The founder (super admin) can,
  // until a second reviewer joins (PRD 5.3 solo mode).
  if (action === "approve" && authorId === actor.id && !actor.roles.includes("SUPER_ADMIN")) {
    return "You can't approve a question you wrote. Ask another reviewer.";
  }
  return null;
}

export function nextStatus(action: QuestionAction): ContentStatus {
  return TRANSITIONS[action].to;
}

/** Actions to offer for a question in this status. */
export function availableActions(
  status: ContentStatus,
  actor: Actor,
  authorId: string | null,
): QuestionAction[] {
  return (Object.keys(TRANSITIONS) as QuestionAction[]).filter(
    (action) => transitionBlocker(action, status, actor, authorId) === null,
  );
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};
