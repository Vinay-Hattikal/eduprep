import { describe, expect, it } from "vitest";
import {
  availableActions,
  nextStatus,
  STATUS_CHOICES,
  transitionBlocker,
} from "@/lib/content/workflow";

const admin = { id: "u-admin", roles: ["ADMIN"] as const };
const student = { id: "u-student", roles: ["STUDENT"] as const };

describe("content publishing (D-056: no review step)", () => {
  it("follows draft → published → archived", () => {
    expect(nextStatus("publish")).toBe("PUBLISHED");
    expect(nextStatus("unpublish")).toBe("DRAFT");
    expect(nextStatus("archive")).toBe("ARCHIVED");
    expect(nextStatus("restore")).toBe("DRAFT");
  });

  it("offers the right buttons for each status", () => {
    expect(availableActions("DRAFT", admin)).toEqual(["publish", "archive"]);
    expect(availableActions("PUBLISHED", admin)).toEqual(["unpublish", "archive"]);
    expect(availableActions("ARCHIVED", admin)).toEqual(["restore"]);
  });

  it("treats old in-review items as drafts", () => {
    expect(availableActions("IN_REVIEW", admin)).toEqual(["publish", "archive"]);
    expect(STATUS_CHOICES).not.toContain("IN_REVIEW");
  });

  it("lets an admin publish their own content but not students", () => {
    expect(transitionBlocker("publish", "DRAFT", admin)).toBeNull();
    expect(transitionBlocker("publish", "DRAFT", student)).toMatch(/Only admins/);
    expect(availableActions("DRAFT", student)).toEqual([]);
  });

  it("rejects transitions from the wrong status", () => {
    expect(transitionBlocker("publish", "PUBLISHED", admin)).toMatch(/Can't/);
    expect(transitionBlocker("restore", "PUBLISHED", admin)).toMatch(/Can't/);
  });
});
