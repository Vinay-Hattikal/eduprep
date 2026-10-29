import { describe, expect, it } from "vitest";
import {
  contestReminderAt,
  jobMatchesStudent,
  nextDigestAt,
  type AlertJob,
  type AlertStudent,
} from "@/lib/jobs/alerts";

describe("digest and reminder times (D-059)", () => {
  it("sends the digest at the next 18:00 IST", () => {
    expect(nextDigestAt(new Date("2026-10-29T10:00:00Z")).toISOString()).toBe(
      "2026-10-29T12:30:00.000Z",
    );
    expect(nextDigestAt(new Date("2026-10-29T12:30:00Z")).toISOString()).toBe(
      "2026-10-30T12:30:00.000Z",
    );
  });

  it("reminds 24 h before a contest, right away if that's past, never in the last hour", () => {
    const now = new Date("2026-10-29T00:00:00Z");
    expect(contestReminderAt(new Date("2026-11-01T04:30:00Z"), now)?.toISOString()).toBe(
      "2026-10-31T04:30:00.000Z",
    );
    expect(contestReminderAt(new Date("2026-10-29T06:00:00Z"), now)).toEqual(now);
    expect(contestReminderAt(new Date("2026-10-29T00:30:00Z"), now)).toBeNull();
  });
});

describe("jobMatchesStudent", () => {
  const job: AlertJob = {
    audience: ["FRESHER"],
    minExperience: null,
    maxExperience: null,
    branches: ["CSE", "IT"],
    gradYears: [2026],
    minCgpa: 7,
    maxBacklogs: 0,
  };
  const fresher = (
    fresherProfile: Partial<NonNullable<AlertStudent["fresher"]>>,
  ): AlertStudent => ({
    profileType: "FRESHER",
    fresher: {
      branch: "CSE",
      gradYear: 2026,
      cgpaBand: "8.0–8.9",
      hasBacklogs: false,
      ...fresherProfile,
    },
    yearsExperience: null,
  });

  it("alerts eligible freshers and those whose details are missing", () => {
    expect(jobMatchesStudent(fresher({}), job)).toBe(true);
    expect(jobMatchesStudent(fresher({ cgpaBand: null, gradYear: null }), job)).toBe(true);
  });

  it("skips freshers the rules exclude and the wrong audience", () => {
    expect(jobMatchesStudent(fresher({ branch: "MECH" }), job)).toBe(false);
    expect(jobMatchesStudent(fresher({ cgpaBand: "6.0–6.9" }), job)).toBe(false);
    expect(jobMatchesStudent(fresher({ hasBacklogs: true }), job)).toBe(false);
    expect(
      jobMatchesStudent({ profileType: "EXPERIENCED", fresher: null, yearsExperience: 3 }, job),
    ).toBe(false);
    expect(
      jobMatchesStudent({ profileType: null, fresher: null, yearsExperience: null }, job),
    ).toBe(false);
  });

  it("checks experienced candidates' years", () => {
    const senior: AlertJob = {
      ...job,
      audience: ["EXPERIENCED"],
      minExperience: 2,
      maxExperience: 5,
    };
    const pro = (years: number | null): AlertStudent => ({
      profileType: "EXPERIENCED",
      fresher: null,
      yearsExperience: years,
    });
    expect(jobMatchesStudent(pro(3), senior)).toBe(true);
    expect(jobMatchesStudent(pro(1), senior)).toBe(false);
    expect(jobMatchesStudent(pro(8), senior)).toBe(false);
    expect(jobMatchesStudent(pro(null), senior)).toBe(true);
  });
});
