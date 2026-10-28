// Roles and permissions (PRD section 7). Pure functions, safe on client and server.
// UI uses these to hide things; the server re-checks with src/server/permissions.ts.

import type { Role } from "@/generated/prisma/enums";

export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "CONTENT_AUTHOR",
  "REVIEWER",
  "OPS_ADMIN",
  "SUPPORT_ADMIN",
] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: "Student",
  INTERVIEWER: "Interviewer",
  SUPER_ADMIN: "Super admin",
  CONTENT_AUTHOR: "Content author",
  REVIEWER: "Reviewer",
  OPS_ADMIN: "Ops admin",
  SUPPORT_ADMIN: "Support admin",
};

/** Which roles may do what. Super admin can do everything. */
export const PERMISSIONS = {
  "student.access": ["STUDENT"],
  "interviewer.access": ["INTERVIEWER"],
  "admin.access": [...ADMIN_ROLES],
  "content.view": ["CONTENT_AUTHOR", "REVIEWER"],
  "content.edit": ["CONTENT_AUTHOR", "REVIEWER"],
  "content.publish": ["REVIEWER"],
  "taxonomy.manage": ["REVIEWER"],
  "companies.manage": ["CONTENT_AUTHOR", "OPS_ADMIN"],
  "companies.publish": ["REVIEWER", "OPS_ADMIN"],
  "imports.view": ["CONTENT_AUTHOR", "REVIEWER", "OPS_ADMIN"],
  "users.view": ["SUPPORT_ADMIN"],
  "jobs.view": ["OPS_ADMIN"],
  "interviews.manage": ["OPS_ADMIN"],
  "users.grant": ["SUPPORT_ADMIN"],
  "payments.refund": ["SUPPORT_ADMIN"],
  "coupons.manage": ["SUPPORT_ADMIN", "OPS_ADMIN"],
  "experiences.moderate": ["REVIEWER", "OPS_ADMIN"],
  "discussions.moderate": ["REVIEWER", "SUPPORT_ADMIN"],
  "postings.manage": ["OPS_ADMIN", "CONTENT_AUTHOR"],
  "contests.manage": ["REVIEWER", "OPS_ADMIN"],
  "notifications.view": ["OPS_ADMIN", "SUPPORT_ADMIN"],
  "settings.view": [...ADMIN_ROLES],
  "settings.manage": [],
  "users.roles": [],
  "audit.view": [],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasAnyRole(roles: readonly Role[], allowed: readonly Role[]): boolean {
  return roles.some((role) => allowed.includes(role));
}

export function can(roles: readonly Role[], permission: Permission): boolean {
  if (roles.includes("SUPER_ADMIN")) return true;
  return hasAnyRole(roles, PERMISSIONS[permission]);
}

export function isAdmin(roles: readonly Role[]): boolean {
  return hasAnyRole(roles, ADMIN_ROLES);
}

/** Where a user lands after signing in. Admin wins over interviewer, interviewer over student. */
export function homePathFor(roles: readonly Role[]): string {
  if (isAdmin(roles)) return "/admin";
  if (roles.includes("INTERVIEWER")) return "/interviewer";
  return "/dashboard";
}

/** Only allow same-site relative redirects after sign-in. */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
