// Content publishing rules (D-056): Draft -> Published -> Archived, with no review step.
// One admin role writes and publishes. Pure, so the rules are unit-tested and shared by the UI
// (which buttons to show) and the server.
//
// IN_REVIEW is still in the database enum (removing an enum value means rebuilding every
// content table) but nothing sets it any more; it's treated like a draft.

import type { ContentStatus, Difficulty, Role } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";

export type ContentAction = "publish" | "unpublish" | "archive" | "restore";

export const CONTENT_ACTIONS: readonly ContentAction[] = [
  "publish",
  "unpublish",
  "archive",
  "restore",
];

export const STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

/** Statuses that count as a draft (old IN_REVIEW rows are drafts, D-056). */
export const DRAFT_STATUSES: ContentStatus[] = ["DRAFT", "IN_REVIEW"];

/** Statuses to offer in filters (IN_REVIEW is no longer used). */
export const STATUS_CHOICES: ContentStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const ACTION_LABELS: Record<ContentAction, string> = {
  publish: "Publish",
  unpublish: "Unpublish",
  archive: "Archive",
  restore: "Restore to draft",
};

const TRANSITIONS: Record<ContentAction, { from: ContentStatus[]; to: ContentStatus }> = {
  publish: { from: DRAFT_STATUSES, to: "PUBLISHED" },
  unpublish: { from: ["PUBLISHED"], to: "DRAFT" },
  archive: { from: ["DRAFT", "IN_REVIEW", "PUBLISHED"], to: "ARCHIVED" },
  restore: { from: ["ARCHIVED"], to: "DRAFT" },
};

export type Actor = { id: string; roles: readonly Role[] };

/** Null when allowed, otherwise the reason shown to the admin. */
export function transitionBlocker(
  action: ContentAction,
  status: ContentStatus,
  actor: Actor,
): string | null {
  if (!can(actor.roles, "content.publish")) return "Only admins can do this.";
  if (!TRANSITIONS[action].from.includes(status)) {
    return `Can't ${ACTION_LABELS[action].toLowerCase()} something that is ${STATUS_LABELS[status].toLowerCase()}.`;
  }
  return null;
}

export function nextStatus(action: ContentAction): ContentStatus {
  return TRANSITIONS[action].to;
}

/** Actions to offer for content in this status. */
export function availableActions(status: ContentStatus, actor: Actor): ContentAction[] {
  return CONTENT_ACTIONS.filter((action) => transitionBlocker(action, status, actor) === null);
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};
