// Rules for giving and removing admin access (D-056: one admin role). Pure, so unit-tested.

import type { Role } from "@/generated/prisma/enums";

/**
 * The user's roles with admin access turned on or off. Student and interviewer roles aren't
 * touched (interviewers are approved on the Interviewers page). Someone left with no role at
 * all keeps a student account, so they can still sign in.
 */
export function nextRoles(current: readonly Role[], admin: boolean): Role[] {
  const kept = current.filter((role) => role !== "ADMIN");
  const roles: Role[] = admin ? [...kept, "ADMIN"] : kept;
  return roles.length ? roles : ["STUDENT"];
}

/** Null when the change is allowed, otherwise the reason. */
export function roleChangeBlocker(input: {
  actorId: string;
  targetId: string;
  before: readonly Role[];
  after: readonly Role[];
  /** Admins in the whole system, before the change. */
  admins: number;
}): string | null {
  const removesAdmin = input.before.includes("ADMIN") && !input.after.includes("ADMIN");
  if (!removesAdmin) return null;
  if (input.actorId === input.targetId)
    return "You can't remove your own admin access. Ask another admin.";
  if (input.admins <= 1) return "There must always be at least one admin.";
  return null;
}
