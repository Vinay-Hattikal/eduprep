import { describe, expect, it } from "vitest";
import { availableActions, nextStatus, transitionBlocker } from "@/lib/content/workflow";

const author = { id: "u-author", roles: ["CONTENT_AUTHOR"] as const };
const reviewer = { id: "u-reviewer", roles: ["REVIEWER"] as const };
const founder = { id: "u-founder", roles: ["SUPER_ADMIN"] as const };

describe("question workflow", () => {
  it("follows draft → review → published", () => {
    expect(nextStatus("submit")).toBe("IN_REVIEW");
    expect(nextStatus("approve")).toBe("PUBLISHED");
    expect(nextStatus("reject")).toBe("DRAFT");
    expect(nextStatus("archive")).toBe("ARCHIVED");
    expect(nextStatus("restore")).toBe("DRAFT");
  });

  it("lets authors submit drafts but not publish", () => {
    expect(availableActions("DRAFT", author, author.id)).toEqual(["submit"]);
    expect(availableActions("IN_REVIEW", author, author.id)).toEqual([]);
  });

  it("lets reviewers approve or send back other people's questions", () => {
    expect(availableActions("IN_REVIEW", reviewer, author.id)).toEqual([
      "approve",
      "reject",
      "archive",
    ]);
  });

  it("stops reviewers approving their own questions (blind review)", () => {
    expect(transitionBlocker("approve", "IN_REVIEW", reviewer, reviewer.id)).toMatch(/you wrote/);
  });

  it("lets the founder approve their own questions in solo mode", () => {
    expect(transitionBlocker("approve", "IN_REVIEW", founder, founder.id)).toBeNull();
  });

  it("rejects transitions from the wrong status", () => {
    expect(transitionBlocker("approve", "DRAFT", reviewer, author.id)).toMatch(/Can't/);
    expect(transitionBlocker("restore", "PUBLISHED", reviewer, author.id)).toMatch(/Can't/);
  });
});
