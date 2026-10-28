import { describe, expect, it } from "vitest";
import { nextExternalId, parseMonths, readAskedAt } from "@/lib/content/asked-at";

const today = new Date("2026-10-28T10:00:00Z");

describe("parseMonths", () => {
  it("reads months newest first without repeats", () => {
    expect(parseMonths("2026-08, 2026-09 2026-08|2025-12", today)).toEqual({
      months: ["2026-09", "2026-08", "2025-12"],
    });
    expect(parseMonths("", today)).toEqual({ months: [] });
  });

  it("refuses bad and future months", () => {
    expect(parseMonths("2026-13", today).error).toMatch(/isn't a month/);
    expect(parseMonths("Aug 2026", today).error).toMatch(/isn't a month/);
    expect(parseMonths("2026-11", today).error).toMatch(/future/);
    expect(parseMonths("2026-10", today).error).toBeUndefined();
  });
});

describe("readAskedAt", () => {
  it("skips empty rows and refuses repeats and orphan months", () => {
    expect(
      readAskedAt(
        [
          { companyId: "c1", askedIn: "2026-08" },
          { companyId: "", askedIn: "" },
          { companyId: "c2", askedIn: "" },
        ],
        today,
      ),
    ).toEqual({
      links: [
        { companyId: "c1", askedIn: ["2026-08"] },
        { companyId: "c2", askedIn: [] },
      ],
    });
    expect(
      readAskedAt(
        [
          { companyId: "c1", askedIn: "" },
          { companyId: "c1", askedIn: "" },
        ],
        today,
      ).error,
    ).toMatch(/twice/);
    expect(readAskedAt([{ companyId: "", askedIn: "2026-08" }], today).error).toMatch(
      /Choose the company/,
    );
  });
});

describe("nextExternalId", () => {
  it("keeps the prefix and the width", () => {
    expect(nextExternalId("QA-PCT-0042")).toBe("QA-PCT-0043");
    expect(nextExternalId("QA-PCT-0099")).toBe("QA-PCT-0100");
    expect(nextExternalId("Q9")).toBe("Q10");
    expect(nextExternalId("NO-NUMBER")).toBe("");
  });
});
