import type { Permission } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";

/**
 * Redirects users without the permission before an area renders (better UX than a broken page).
 * Layout checks don't protect data on client navigations, so pages and actions that read
 * protected data must still call requirePermission() themselves.
 */
export async function AccessGate({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  await requirePermission(permission);
  return children;
}
