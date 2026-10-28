import { describe, expect, it } from "vitest";
import { commentProblem, sortComments } from "@/lib/community/comments";
import { contestPhase, rankSittings, resultsAt, topShareLabel } from "@/lib/contests/ranking";
import { contestBadges, crossedStatBadges, solveBadges, testBadges } from "@/lib/engagement/badges";
import { linkedinShareUrl, shareText, whatsappShareUrl } from "@/lib/engagement/share";
import { publicName } from "@/lib/format";
import {
  experienceLabel,
  isAcceptingApplications,
  isSafeApplyUrl,
  jobSlug,
} from "@/lib/jobs/postings";
import { addDays } from "@/lib/learning/dates";
import { recordActivity, streakSafeDays, visibleStreak } from "@/lib/learning/streak";
import { jobPostingFormSchema } from "@/schemas/job-posting";

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n));
const rules = { earnEvery: 7, maxFreezes: 2 };

describe("streak freezes", () => {
  it("earns a freeze every 7 days, up to the limit", () => {
    let state = recordActivity(
      { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
      day(0),
      rules,
    );
    for (let d = 1; d < 21; d++) state = recordActivity(state, day(d), rules);
    expect(state).toMatchObject({ currentStreak: 21, streakFreezes: 2 }); // earned at 7 and 14; 21 is over the cap
    expect(recordActivity({ ...state, streakFreezes: 1 }, day(20), rules).earnedFreeze).toBe(false);
  });

  it("covers missed days with freezes, else restarts", () => {
    const base = { currentStreak: 10, longestStreak: 10, lastActiveDate: day(0), streakFreezes: 2 };
    expect(recordActivity(base, day(3), rules)).toMatchObject({
      currentStreak: 11,
      streakFreezes: 0,
      frozeDays: 2,
      lastFreezeOn: day(2),
    });
    expect(recordActivity(base, day(4), rules)).toMatchObject({
      currentStreak: 1,
      longestStreak: 10,
      streakFreezes: 2,
      frozeDays: 0,
    });
    // Without rules, it's the plain streak.
    expect(recordActivity({ ...base, streakFreezes: 0 }, day(2))).toMatchObject({
      currentStreak: 1,
    });
  });

  it("shows a streak as alive while freezes cover the gap", () => {
    const state = { currentStreak: 5, longestStreak: 5, lastActiveDate: day(0), streakFreezes: 1 };
    expect(visibleStreak(state, day(2))).toBe(5);
    expect(visibleStreak(state, day(3))).toBe(0);
    expect(streakSafeDays(state, day(1))).toBe(1);
    expect(streakSafeDays(state, day(2))).toBe(0);
    expect(streakSafeDays(state, day(3))).toBeNull();
  });
});

describe("badges", () => {
  it("reports only thresholds just crossed", () => {
    expect(
      crossedStatBadges(
        { longestStreak: 2, totalAttempts: 99 },
        { longestStreak: 3, totalAttempts: 100 },
      ),
    ).toEqual(["streak-3", "answers-100"]);
    expect(
      crossedStatBadges(
        { longestStreak: 3, totalAttempts: 100 },
        { longestStreak: 3, totalAttempts: 101 },
      ),
    ).toEqual([]);
  });

  it("maps counts and percentiles to badges", () => {
    expect(testBadges(0)).toEqual([]);
    expect(testBadges(10)).toEqual(["first-test", "tests-10"]);
    expect(solveBadges(1)).toEqual(["first-solve"]);
    expect(contestBadges(50)).toEqual(["contest-debut"]);
    expect(contestBadges(99.5)).toEqual(["contest-debut", "contest-top-10", "contest-top-1"]);
  });
});

describe("contest ranking", () => {
  const start = new Date("2026-10-25T04:30:00Z");
  const times = {
    startsAt: start,
    endsAt: new Date(start.getTime() + 3600_000),
    durationMinutes: 60,
  };

  it("moves through its phases", () => {
    expect(contestPhase(times, new Date(start.getTime() - 1))).toBe("upcoming");
    expect(contestPhase(times, start)).toBe("live");
    expect(contestPhase(times, new Date(start.getTime() + 90 * 60_000))).toBe("closing");
    expect(contestPhase(times, resultsAt(times))).toBe("final");
    expect(resultsAt(times).toISOString()).toBe("2026-10-25T06:35:00.000Z");
  });

  it("ranks by score, then time, sharing ranks on exact ties", () => {
    const at = (m: number) => new Date(start.getTime() + m * 60_000);
    const ranked = rankSittings([
      { id: "c", score: 30, timeSec: 900, submittedAt: at(20) },
      { id: "a", score: 50, timeSec: 1200, submittedAt: at(25) },
      { id: "b", score: 50, timeSec: 1000, submittedAt: at(30) },
      { id: "d", score: 30, timeSec: 900, submittedAt: at(35) },
    ]);
    expect(ranked.map((r) => [r.id, r.rank, r.percentile])).toEqual([
      ["b", 1, 100],
      ["a", 2, 100],
      ["c", 3, 50],
      ["d", 3, 50],
    ]);
    expect(rankSittings([])).toEqual([]);
  });

  it("labels only flattering shares", () => {
    expect(topShareLabel(3, 5)).toBeNull();
    expect(topShareLabel(1, 1000)).toBe("Top 1%");
    expect(topShareLabel(42, 1000)).toBe("Top 5%");
    expect(topShareLabel(400, 1000)).toBeNull();
  });
});

describe("job postings", () => {
  it("accepts only http(s) apply links", () => {
    expect(isSafeApplyUrl("https://careers.example.com/jobs/1")).toBe(true);
    expect(isSafeApplyUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeApplyUrl("/jobs/1")).toBe(false);
    expect(isSafeApplyUrl("data:text/html,hi")).toBe(false);
  });

  it("closes after the last day to apply (IST days)", () => {
    const today = day(10);
    const job = (applyBy: Date | null, status = "PUBLISHED" as const) => ({ status, applyBy });
    expect(isAcceptingApplications(job(null), today)).toBe(true);
    expect(isAcceptingApplications(job(day(10)), today)).toBe(true);
    expect(isAcceptingApplications(job(addDays(today, -1)), today)).toBe(false);
    expect(isAcceptingApplications({ status: "CLOSED", applyBy: null }, today)).toBe(false);
  });

  it("formats experience and slugs", () => {
    expect(experienceLabel(0, 0)).toBe("Freshers");
    expect(experienceLabel(0, 2)).toBe("0–2 years");
    expect(experienceLabel(3, null)).toBe("3+ years");
    expect(experienceLabel(null, null)).toBeNull();
    expect(jobSlug("SDE I (Backend)", "Globex & Co.", "a1b2c3")).toBe(
      "globex-co-sde-i-backend-a1b2c3",
    );
  });

  it("validates the admin form", () => {
    const parsed = jobPostingFormSchema.safeParse({
      title: "Analyst",
      companyName: "Initech",
      locations: "Pune, Remote",
      workMode: "HYBRID",
      jobType: "INTERNSHIP",
      audience: ["FRESHER"],
      minExperience: "3",
      maxExperience: "1",
      description: "Help the analytics team with dashboards and data quality checks.",
      branches: "any",
      gradYears: "2026, 2027",
      applyUrl: "javascript:void(0)",
      applyBy: "2026-11-30",
    });
    expect(parsed.success).toBe(false);
    const fields = parsed.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["applyUrl", "maxExperience"]));
  });
});

describe("discussions", () => {
  it("rejects links, contact details and spam", () => {
    expect(commentProblem("ok")).toMatch(/more/);
    expect(commentProblem("Use the formula from www.example.com")).toMatch(/Links/);
    expect(commentProblem("Call me on 98765 43210")).toMatch(/phone/);
    expect(commentProblem("mail me: ravi@example.com")).toMatch(/phone|email/);
    expect(commentProblem("aaaaaaaaaaaaaaa")).toMatch(/spam/);
    expect(commentProblem("Base 100 makes this a one-liner: 25/125 = 20%.")).toBeNull();
  });

  it("puts the most helpful, earliest comments first", () => {
    const at = (n: number) => new Date(2026, 0, n);
    const sorted = sortComments([
      { id: "new", voteCount: 2, createdAt: at(3) },
      { id: "old", voteCount: 2, createdAt: at(1) },
      { id: "top", voteCount: 5, createdAt: at(4) },
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["top", "old", "new"]);
  });
});

describe("sharing", () => {
  it("builds share links and text", () => {
    const data = {
      name: "Asha R.",
      title: "Weekly All-India Mock #1",
      headline: "All-India rank 12 of 4,210",
      detail: "99.74 percentile",
      date: "2026-10-25",
    };
    expect(shareText(data, "App")).toBe(
      "Weekly All-India Mock #1: All-India rank 12 of 4,210 (99.74 percentile) on App.",
    );
    expect(whatsappShareUrl("Hi there", "https://x.example/s/abc")).toBe(
      "https://wa.me/?text=Hi%20there%20https%3A%2F%2Fx.example%2Fs%2Fabc",
    );
    expect(linkedinShareUrl("https://x.example/s/abc")).toContain("url=https%3A%2F%2Fx.example");
  });

  it("shows first name and last initial", () => {
    expect(publicName("Ravi Kumar Sharma")).toBe("Ravi S.");
    expect(publicName("  Neha ")).toBe("Neha");
    expect(publicName("")).toBe("Student");
  });
});
