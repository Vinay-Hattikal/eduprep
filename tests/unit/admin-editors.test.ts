import { describe, expect, it } from "vitest";
import { nextRoles, roleChangeBlocker } from "@/lib/admin-roles";
import { scorecardItems } from "@/lib/interviews/policies";
import { ADMIN_ROLES, can } from "@/lib/permissions";
import {
  interviewTypeFormFromData,
  problemFormFromData,
  rubricKey,
  solutionFormSchema,
  trackFormFromData,
} from "@/schemas/admin-content";
import { INTERVIEW_PRICE_KEYS, SETTINGS } from "@/server/services/settings/registry";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

const problemEntries: [string, string][] = [
  ["externalId", "DSA-ARR-9001"],
  ["slug", "pair-sum"],
  ["title", "Pair sum"],
  ["difficulty", "EASY"],
  ["topicIds", "topic-1"],
  ["languages", "python"],
  ["languages", "cpp"],
  ["statement", "Find two numbers that add up to the target."],
  ["inputFormat", "n, then n numbers, then target"],
  ["outputFormat", "YES or NO"],
  ["constraints", "1 <= n <= 10^5"],
  ["timeLimitMs", "1000"],
  ["memoryLimitMb", "256"],
  ["scoring", "ALL_OR_NOTHING"],
  ["checker", "exact"],
  ["source", "ORIGINAL"],
  ["hint1", "Sort first."],
  ["hint2", ""],
  ["hint3", ""],
  ["editorial", ""],
];

describe("problem form", () => {
  it("reads every field, with lists and blank hints", () => {
    const parsed = problemFormFromData(form(problemEntries));
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      topicIds: ["topic-1"],
      languages: ["python", "cpp"],
      timeLimitMs: 1000,
      hints: ["Sort first.", "", ""],
      editorial: null,
    });
  });

  it("needs a topic, a language and a valid slug", () => {
    const parsed = problemFormFromData(
      form([
        ...problemEntries.filter(([k]) => !["topicIds", "languages", "slug"].includes(k)),
        ["slug", "Pair Sum"],
        ["languages", "rust"],
      ]),
    );
    expect(parsed.success).toBe(false);
    const fields = parsed.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["topicIds", "languages", "slug"]));
  });
});

describe("solution form", () => {
  const base = { problemId: "p1", kind: "REFERENCE", language: "java" };

  it("requires public class Main in Java", () => {
    const bad = solutionFormSchema.safeParse({ ...base, code: "class Solution {}" });
    expect(bad.success).toBe(false);
    const good = solutionFormSchema.safeParse({
      ...base,
      code: "public class Main { public static void main(String[] a) {} }",
    });
    expect(good.success).toBe(true);
  });

  it("turns Windows line endings into \\n and refuses empty code", () => {
    const parsed = solutionFormSchema.safeParse({
      ...base,
      language: "python",
      code: "print(1)\r\nprint(2)\r\n",
    });
    expect(parsed.data?.code).toBe("print(1)\nprint(2)\n");
    expect(
      solutionFormSchema.safeParse({ ...base, language: "python", code: "  \n" }).success,
    ).toBe(false);
  });
});

describe("interview type form", () => {
  const entries = (rubric: [string, string, string][]): [string, string][] => [
    ["slug", "mock-hr"],
    ["name", "HR"],
    ["description", "Behavioural round."],
    ["audience", "BOTH"],
    ["durationMin", "45"],
    ["priceSetting", "interviews.hr"],
    ["order", "1"],
    ["active", "on"],
    ...rubric.flatMap(([key, label, description]): [string, string][] => [
      ["rubricKey", key],
      ["rubricLabel", label],
      ["rubricDescription", description],
    ]),
  ];

  it("keeps existing rubric keys and derives keys for new items", () => {
    const parsed = interviewTypeFormFromData(
      form(
        entries([
          ["communication", "Clear communication", "Explains clearly."],
          ["", "Problem solving!", "Breaks the problem down."],
          ["", "", ""],
        ]),
      ),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data!.active).toBe(true);
    expect(parsed.data!.rubric.map((i) => i.key)).toEqual(["communication", "problem-solving"]);
  });

  it("refuses two items with the same key and an empty rubric", () => {
    const dupes = interviewTypeFormFromData(
      form(
        entries([
          ["", "Coding", "a"],
          ["", "coding", "b"],
        ]),
      ),
    );
    expect(dupes.success).toBe(false);
    expect(interviewTypeFormFromData(form(entries([]))).success).toBe(false);
  });

  it("makes stable rubric keys", () => {
    expect(rubricKey("  System Design & Trade-offs ")).toBe("system-design-trade-offs");
  });

  it("offers only interview prices in money", () => {
    expect(INTERVIEW_PRICE_KEYS.length).toBeGreaterThan(0);
    for (const key of INTERVIEW_PRICE_KEYS) {
      expect(SETTINGS[key].group).toBe("interviews");
      expect(SETTINGS[key].kind).toBe("money");
    }
    expect(INTERVIEW_PRICE_KEYS).not.toContain("interviews.bundle3DiscountPercent");
  });
});

describe("track form", () => {
  it("defaults the order to 0 and needs a topic", () => {
    const parsed = trackFormFromData(
      form([
        ["slug", "switch"],
        ["name", "Service to product"],
        ["description", "Move to a product company."],
        ["roadmap", "1. DSA"],
        ["audience", "EXPERIENCED"],
        ["order", ""],
      ]),
    );
    expect(parsed.success).toBe(false);
    expect(parsed.error!.issues.map((i) => i.path[0])).toEqual(["topicIds"]);
  });
});

describe("scorecards after a rubric edit", () => {
  it("skips items added later and keeps scores of removed items", () => {
    const items = scorecardItems(
      [
        { key: "communication", label: "Communication (renamed)", description: "" },
        { key: "new-item", label: "Added later", description: "" },
      ],
      [
        { key: "communication", score: 4, comment: "" },
        { key: "problem-solving", score: 3, comment: "Good" },
      ],
    );
    expect(items.map((i) => [i.label, i.score.score])).toEqual([
      ["Communication (renamed)", 4],
      ["Problem solving", 3],
    ]);
  });
});

describe("admin roles", () => {
  it("lets only super admins change roles", () => {
    for (const role of ADMIN_ROLES.filter((r) => r !== "SUPER_ADMIN"))
      expect(can([role], "users.roles")).toBe(false);
    expect(can(["SUPER_ADMIN"], "users.roles")).toBe(true);
  });

  it("changes admin roles only and keeps everyone signed-in-able", () => {
    expect(nextRoles(["STUDENT", "REVIEWER"], ["OPS_ADMIN"])).toEqual(["STUDENT", "OPS_ADMIN"]);
    expect(nextRoles(["INTERVIEWER", "REVIEWER"], [])).toEqual(["INTERVIEWER"]);
    expect(nextRoles(["REVIEWER"], [])).toEqual(["STUDENT"]);
    expect(nextRoles(["STUDENT"], ["STUDENT", "INTERVIEWER"])).toEqual(["STUDENT"]);
  });

  it("protects the last super admin and your own super admin role", () => {
    const change = {
      before: ["SUPER_ADMIN"] as const,
      after: ["STUDENT"] as const,
    };
    expect(roleChangeBlocker({ ...change, actorId: "a", targetId: "a", superAdmins: 3 })).toMatch(
      /your own/,
    );
    expect(roleChangeBlocker({ ...change, actorId: "a", targetId: "b", superAdmins: 1 })).toMatch(
      /at least one/,
    );
    expect(
      roleChangeBlocker({ ...change, actorId: "a", targetId: "b", superAdmins: 2 }),
    ).toBeNull();
    expect(
      roleChangeBlocker({
        actorId: "a",
        targetId: "a",
        before: ["SUPER_ADMIN"],
        after: ["SUPER_ADMIN", "REVIEWER"],
        superAdmins: 1,
      }),
    ).toBeNull();
  });
});
