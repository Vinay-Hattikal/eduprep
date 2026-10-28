// Question discussions (D-048): what a comment may contain. Pure, used by the form and server.

export const COMMENT_MIN = 3;
export const COMMENT_MAX = 1500;

export const FLAG_REASONS = {
  SPAM: "Spam or advertising",
  ABUSE: "Rude or abusive",
  SPOILER: "Off-topic",
  WRONG: "Misleading or wrong",
} as const;

export type FlagReason = keyof typeof FLAG_REASONS;

// Links are the usual spam vector. Plain domain mentions ("geeksforgeeks.org") are allowed; URLs
// with a scheme or "www." are not.
const LINK = /\b(?:https?:\/\/|www\.)\S+/i;
const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/** Why a comment can't be posted, or null if it's fine. */
export function commentProblem(body: string): string | null {
  const text = body.trim();
  if (text.length < COMMENT_MIN) return "Write a little more.";
  if (text.length > COMMENT_MAX) return `Keep it under ${COMMENT_MAX} characters.`;
  if (LINK.test(text)) return "Links aren't allowed in discussions.";
  if (PHONE.test(text) || EMAIL.test(text))
    return "Don't share phone numbers or email addresses here.";
  if (/(.)\1{9,}/.test(text)) return "That looks like spam.";
  return null;
}

/** Best first: most upvoted, then oldest (the first good answer stays on top). */
export function sortComments<T extends { voteCount: number; createdAt: Date }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => b.voteCount - a.voteCount || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}
