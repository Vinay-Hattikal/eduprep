import { describe, expect, it } from "vitest";
import { adminNav, isActivePath, studentNav } from "@/config/navigation";

describe("isActivePath", () => {
  it("matches area roots exactly", () => {
    expect(isActivePath("/admin", "/admin")).toBe(true);
    expect(isActivePath("/admin/settings", "/admin")).toBe(false);
  });

  it("matches sections by prefix", () => {
    expect(isActivePath("/admin/settings", "/admin/settings")).toBe(true);
    expect(isActivePath("/practice/percentages", "/practice")).toBe(true);
    expect(isActivePath("/practice-tests", "/practice")).toBe(false);
  });
});

it("gives every admin nav item a permission", () => {
  for (const item of adminNav.flatMap((section) => section.items)) {
    expect(item.permission, item.href).toBeDefined();
  }
});

it("keeps the phone tab bar to five items", () => {
  expect(studentNav.slice(0, 5)).toHaveLength(5);
});
