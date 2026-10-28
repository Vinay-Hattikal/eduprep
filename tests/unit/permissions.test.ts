import { describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { Role as RoleEnum } from "@/generated/prisma/enums";
import {
  ADMIN_ROLES,
  can,
  homePathFor,
  isAdmin,
  PERMISSIONS,
  ROLE_LABELS,
  safeRedirectPath,
} from "@/lib/permissions";

describe("can", () => {
  it("lets super admins do everything", () => {
    for (const permission of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(can(["SUPER_ADMIN"], permission)).toBe(true);
    }
  });

  it("keeps students out of the admin panel", () => {
    expect(can(["STUDENT"], "admin.access")).toBe(false);
    expect(can(["STUDENT"], "student.access")).toBe(true);
  });

  it("only lets support and super admins see users' contact details", () => {
    const allowed = Object.values(RoleEnum).filter((role) => can([role], "users.view"));
    expect(allowed.sort()).toEqual(["SUPER_ADMIN", "SUPPORT_ADMIN"]);
  });

  it("only lets reviewers and super admins publish content", () => {
    expect(can(["CONTENT_AUTHOR"], "content.publish")).toBe(false);
    expect(can(["REVIEWER"], "content.publish")).toBe(true);
  });

  it("reserves settings changes and the audit log for super admins", () => {
    for (const role of ADMIN_ROLES.filter((r) => r !== "SUPER_ADMIN")) {
      expect(can([role], "settings.manage")).toBe(false);
      expect(can([role], "audit.view")).toBe(false);
      expect(can([role], "settings.view")).toBe(true);
    }
  });

  it("combines multiple roles", () => {
    expect(can(["STUDENT", "INTERVIEWER"], "interviewer.access")).toBe(true);
  });
});

describe("homePathFor", () => {
  it.each<[Role[], string]>([
    [["STUDENT"], "/dashboard"],
    [["INTERVIEWER"], "/interviewer"],
    [["REVIEWER"], "/admin"],
    [["STUDENT", "SUPER_ADMIN"], "/admin"],
    [["STUDENT", "INTERVIEWER"], "/interviewer"],
  ])("sends %j to %s", (roles, path) => {
    expect(homePathFor(roles)).toBe(path);
  });
});

describe("safeRedirectPath", () => {
  it("accepts same-site paths", () => {
    expect(safeRedirectPath("/admin/settings?tab=1")).toBe("/admin/settings?tab=1");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "admin", "", 42, null])(
    "rejects %j",
    (value) => {
      expect(safeRedirectPath(value)).toBeNull();
    },
  );
});

it("labels every role", () => {
  expect(Object.keys(ROLE_LABELS).sort()).toEqual(Object.values(RoleEnum).sort());
  expect(isAdmin(["STUDENT"])).toBe(false);
});
