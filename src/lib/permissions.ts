// Roles and permissions (PRD section 7). Pure functions, safe on client and server.
// UI uses these to hide things; the server re-checks with src/server/permissions.ts.

import type { Role } from "@/generated/prisma/enums";

/**
 * One admin role that can do everything (D-056). The permission names stay, so splitting the
 * work across roles later (content, ops, support) only means editing this table.
 */
export const ADMIN_ROLES = ["ADMIN"] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: "Student",
  INTERVIEWER: "Interviewer",
  ADMIN: "Admin",
};

const ADMIN = ["ADMIN"] as const;

/** Which roles may do what. */
export const PERMISSIONS = {
  "student.access": ["STUDENT"],
  "interviewer.access": ["INTERVIEWER"],
  "admin.access": ADMIN,
  "content.view": ADMIN,
  "content.edit": ADMIN,
  "content.publish": ADMIN,
  "taxonomy.manage": ADMIN,
  "companies.manage": ADMIN,
  "companies.publish": ADMIN,
  "imports.view": ADMIN,
  "users.view": ADMIN,
  "jobs.view": ADMIN,
  "interviews.manage": ADMIN,
  "users.grant": ADMIN,
  "payments.refund": ADMIN,
  "coupons.manage": ADMIN,
  "experiences.moderate": ADMIN,
  "discussions.moderate": ADMIN,
  "postings.manage": ADMIN,
  "contests.manage": ADMIN,
  "notifications.view": ADMIN,
  "settings.view": ADMIN,
  "settings.manage": ADMIN,
  "users.roles": ADMIN,
  "audit.view": ADMIN,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasAnyRole(roles: readonly Role[], allowed: readonly Role[]): boolean {
  return roles.some((role) => allowed.includes(role));
}

export function can(roles: readonly Role[], permission: Permission): boolean {
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
