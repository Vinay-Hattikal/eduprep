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
  it("lets the admin role do everything in the admin panel (D-056)", () => {
    const areas = ["student.access", "interviewer.access"];
    for (const permission of (Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).filter(
      (p) => !areas.includes(p),
    )) {
      expect(can(["ADMIN"], permission), permission).toBe(true);
    }
    expect(ADMIN_ROLES).toEqual(["ADMIN"]);
  });

  it("keeps students and interviewers out of the admin panel", () => {
    for (const role of ["STUDENT", "INTERVIEWER"] as const) {
      expect(can([role], "admin.access")).toBe(false);
      expect(can([role], "users.view")).toBe(false);
      expect(can([role], "content.publish")).toBe(false);
    }
    expect(can(["STUDENT"], "student.access")).toBe(true);
  });

  it("only lets admins see users' contact details", () => {
    expect(can(["ADMIN"], "student.access")).toBe(false);
    const allowed = Object.values(RoleEnum).filter((role) => can([role], "users.view"));
    expect(allowed).toEqual(["ADMIN"]);
  });

  it("combines multiple roles", () => {
    expect(can(["STUDENT", "INTERVIEWER"], "interviewer.access")).toBe(true);
  });
});

describe("homePathFor", () => {
  it.each<[Role[], string]>([
    [["STUDENT"], "/dashboard"],
    [["INTERVIEWER"], "/interviewer"],
    [["ADMIN"], "/admin"],
    [["STUDENT", "ADMIN"], "/admin"],
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
