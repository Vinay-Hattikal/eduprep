// Rules for giving and removing admin roles (super admins only). Pure, so they're unit-tested.

import type { Role } from "@/generated/prisma/enums";
import { ADMIN_ROLES } from "@/lib/permissions";

/**
 * The user's roles after an admin-role change. Student and interviewer roles aren't touched
 * here (interviewers are approved on the Interviewers page). Someone left with no role at all
 * keeps a student account, so they can still sign in.
 */
export function nextRoles(current: readonly Role[], adminRoles: readonly Role[]): Role[] {
  const kept = current.filter((role) => !(ADMIN_ROLES as readonly Role[]).includes(role));
  const added = (ADMIN_ROLES as readonly Role[]).filter((role) => adminRoles.includes(role));
  const roles = [...kept, ...added];
  return roles.length ? roles : ["STUDENT"];
}

/** Null when the change is allowed, otherwise the reason. */
export function roleChangeBlocker(input: {
  actorId: string;
  targetId: string;
  before: readonly Role[];
  after: readonly Role[];
  /** Super admins in the whole system, before the change. */
  superAdmins: number;
}): string | null {
  const removesSuper = input.before.includes("SUPER_ADMIN") && !input.after.includes("SUPER_ADMIN");
  if (!removesSuper) return null;
  if (input.actorId === input.targetId)
    return "You can't remove your own super admin role. Ask another super admin.";
  if (input.superAdmins <= 1) return "There must always be at least one super admin.";
  return null;
}
