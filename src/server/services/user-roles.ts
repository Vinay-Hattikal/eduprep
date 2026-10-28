import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { nextRoles, roleChangeBlocker } from "@/lib/admin-roles";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";

/**
 * Sets a user's admin roles. Roles are read from the database on every request, so the change
 * applies on the user's next page load without signing them out.
 */
export async function setAdminRoles(
  userId: string,
  adminRoles: Role[],
  actor: { id: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { roles: true } });
    if (!user) return { ok: false, error: "This user no longer exists." };
    const roles = nextRoles(user.roles, adminRoles);
    const superAdmins = await tx.user.count({ where: { roles: { has: "SUPER_ADMIN" } } });
    const blocker = roleChangeBlocker({
      actorId: actor.id,
      targetId: userId,
      before: user.roles,
      after: roles,
      superAdmins,
    });
    if (blocker) return { ok: false, error: blocker };
    if ([...roles].sort().join() === [...user.roles].sort().join()) return { ok: true };
    await tx.user.update({ where: { id: userId }, data: { roles } });
    await recordAudit(
      {
        actorId: actor.id,
        action: "user.roles",
        entityType: "user",
        entityId: userId,
        before: { roles: user.roles },
        after: { roles },
      },
      tx,
    );
    return { ok: true };
  });
}
