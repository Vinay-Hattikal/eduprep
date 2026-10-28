import { describe, expect, it } from "vitest";
import { addDays, daysBetween, dayKey, istDay } from "@/lib/learning/dates";
import { checkEligibility, overallEligibility } from "@/lib/learning/eligibility";
import { gradeAnswer } from "@/lib/learning/grading";
import { applyAnswer, EMPTY_MASTERY, masteryLevel, masteryScore } from "@/lib/learning/mastery";
import { computeReadiness, readinessBand, topicWeights } from "@/lib/learning/readiness";
import { shortDay, weeklyAccuracy } from "@/lib/learning/series";
import { recordActivity, visibleStreak } from "@/lib/learning/streak";
import { onboardingSchema } from "@/schemas/onboarding";

describe("IST days", () => {
  it("rolls over at IST midnight, not UTC midnight", () => {
    // 18:29 UTC = 23:59 IST on 19 Oct; 18:30 UTC = 00:00 IST on 20 Oct.
    expect(dayKey(istDay(new Date("2026-10-19T18:29:00Z")))).toBe("2026-10-19");
    expect(dayKey(istDay(new Date("2026-10-19T18:30:00Z")))).toBe("2026-10-20");
  });

  it("counts whole days between days", () => {
    const day = istDay(new Date("2026-10-19T06:00:00Z"));
    expect(daysBetween(day, addDays(day, 30))).toBe(30);
  });
});

describe("gradeAnswer", () => {
  const single = {
    type: "SINGLE" as const,
    correctOptions: ["B"],
    numericAnswer: null,
    tolerance: null,
  };
  const multiple = {
    type: "MULTIPLE" as const,
    correctOptions: ["A", "C"],
    numericAnswer: null,
    tolerance: null,
  };
  const numeric = {
    type: "NUMERIC" as const,
    correctOptions: [],
    numericAnswer: 516.67,
    tolerance: 0.01,
  };
  const answer = (selectedOptions: string[], numericAnswer: number | null = null) => ({
    selectedOptions,
    numericAnswer,
  });

  it("grades single answers", () => {
    expect(gradeAnswer(single, answer(["B"]))).toBe(true);
    expect(gradeAnswer(single, answer(["A"]))).toBe(false);
    expect(gradeAnswer(single, answer(["A", "B"]))).toBe(false);
  });

  it("needs the exact set for multiple answers (no partial credit)", () => {
    expect(gradeAnswer(multiple, answer(["C", "A"]))).toBe(true);
    expect(gradeAnswer(multiple, answer(["A"]))).toBe(false);
    expect(gradeAnswer(multiple, answer(["A", "B", "C"]))).toBe(false);
  });

  it("accepts numeric answers within the tolerance", () => {
    expect(gradeAnswer(numeric, answer([], 516.67))).toBe(true);
    expect(gradeAnswer(numeric, answer([], 516.68))).toBe(true);
    expect(gradeAnswer(numeric, answer([], 516.7))).toBe(false);
    expect(gradeAnswer(numeric, answer([], null))).toBe(false);
    expect(
      gradeAnswer({ ...numeric, numericAnswer: 0.3, tolerance: 0 }, answer([], 0.1 + 0.2)),
    ).toBe(true);
  });
});

describe("mastery", () => {
  it("starts at zero and needs several answers to get high", () => {
    const one = applyAnswer(EMPTY_MASTERY, { correct: true, difficulty: "EASY" });
    expect(one.score).toBe(33); // 1 / (1 + 2)
    let state = EMPTY_MASTERY;
    for (let i = 0; i < 10; i++)
      state = applyAnswer(state, { correct: true, difficulty: "MEDIUM" });
    expect(masteryScore(state.weightSum, state.correctSum)).toBeGreaterThan(70);
  });

  it("weights harder questions more", () => {
    const easy = applyAnswer(EMPTY_MASTERY, { correct: true, difficulty: "EASY" }).score;
    const hard = applyAnswer(EMPTY_MASTERY, { correct: true, difficulty: "HARD" }).score;
    expect(hard).toBeGreaterThan(easy);
  });

  it("lets recent answers count more than old ones", () => {
    let improving = EMPTY_MASTERY;
    let declining = EMPTY_MASTERY;
    for (let i = 0; i < 10; i++) {
      improving = applyAnswer(improving, { correct: i >= 5, difficulty: "MEDIUM" });
      declining = applyAnswer(declining, { correct: i < 5, difficulty: "MEDIUM" });
    }
    expect(masteryScore(improving.weightSum, improving.correctSum)).toBeGreaterThan(
      masteryScore(declining.weightSum, declining.correctSum),
    );
    expect(improving).toMatchObject({ attempts: 10, correct: 5 });
  });

  it("labels levels", () => {
    expect(masteryLevel(0, 0)).toBe("new");
    expect(masteryLevel(30, 4)).toBe("weak");
    expect(masteryLevel(55, 4)).toBe("fair");
    expect(masteryLevel(80, 4)).toBe("strong");
  });
});

describe("streak", () => {
  const day = (n: number) => addDays(istDay(new Date("2026-10-01T06:00:00Z")), n);
  const empty = { currentStreak: 0, longestStreak: 0, lastActiveDate: null };

  it("grows on consecutive days and counts a day once", () => {
    let state = recordActivity(empty, day(0));
    state = recordActivity(state, day(0));
    state = recordActivity(state, day(1));
    state = recordActivity(state, day(2));
    expect(state).toMatchObject({ currentStreak: 3, longestStreak: 3 });
  });

  it("restarts after a missed day but keeps the best", () => {
    let state = recordActivity(empty, day(0));
    state = recordActivity(state, day(1));
    state = recordActivity(state, day(5));
    expect(state).toMatchObject({ currentStreak: 1, longestStreak: 2 });
  });

  it("shows the streak until a full day is missed", () => {
    const state = { currentStreak: 4, longestStreak: 4, lastActiveDate: day(10) };
    expect(visibleStreak(state, day(10))).toBe(4);
    expect(visibleStreak(state, day(11))).toBe(4);
    expect(visibleStreak(state, day(12))).toBe(0);
  });
});

describe("readiness", () => {
  it("spreads each section's questions across its topics", () => {
    const weights = topicWeights([
      { questionCount: 20, topicIds: ["pct", "tw"] },
      { questionCount: 10, topicIds: ["pct"] },
      { questionCount: 5, topicIds: [] },
    ]);
    expect(Object.fromEntries(weights)).toEqual({ pct: 20, tw: 10 });
  });

  it("weights mastery by topic importance and suggests the biggest gains", () => {
    const weights = new Map([
      ["pct", 20],
      ["tw", 10],
    ]);
    const result = computeReadiness(weights, new Map([["pct", 80]]));
    expect(result.score).toBe(53); // (20*80 + 10*0) / 30
    expect(result.focus.map((f) => f.topicId)).toEqual(["tw", "pct"]);
  });

  it("has no score without a test pattern", () => {
    expect(computeReadiness(new Map(), new Map()).score).toBeNull();
  });

  it("bands scores", () => {
    expect([10, 50, 85].map(readinessBand)).toEqual(["low", "building", "ready"]);
  });
});

describe("eligibility", () => {
  const rules = { minCgpa: 7, maxBacklogs: 0, branches: ["CSE", "IT"], gradYears: [2027] };
  const profile = { branch: "CSE", gradYear: 2027, cgpaBand: "8.0–8.9", hasBacklogs: false };

  it("passes a matching profile", () => {
    expect(overallEligibility(checkEligibility(profile, rules))).toBe("ok");
  });

  it("fails clear mismatches", () => {
    const checks = checkEligibility(
      { ...profile, branch: "MECH", hasBacklogs: true, gradYear: 2026, cgpaBand: "6.0–6.9" },
      rules,
    );
    expect(checks.filter((c) => c.status === "fail").map((c) => c.criterion)).toEqual([
      "CGPA",
      "Backlogs",
      "Branch",
      "Graduation year",
    ]);
  });

  it("is unsure when the CGPA band straddles the cut-off or data is missing", () => {
    const straddle = checkEligibility(
      { ...profile, cgpaBand: "7.0–7.9" },
      { ...rules, minCgpa: 7.5 },
    );
    expect(straddle[0]?.status).toBe("unknown");
    expect(overallEligibility(checkEligibility({ ...profile, branch: null }, rules))).toBe(
      "unknown",
    );
  });

  it("skips rules the company doesn't set", () => {
    expect(
      checkEligibility(profile, { minCgpa: null, maxBacklogs: null, branches: [], gradYears: [] }),
    ).toEqual([]);
  });
});

describe("weekly accuracy", () => {
  it("groups days into weeks ending today and hides tiny samples", () => {
    const days = Array.from({ length: 14 }, (_, i) => ({
      day: `2026-10-${String(i + 1).padStart(2, "0")}`,
      answered: i < 7 ? 0 : 2,
      correct: i < 7 ? 0 : 1,
    }));
    days[0]!.answered = 1;
    days[0]!.correct = 1;
    expect(weeklyAccuracy(days)).toEqual([
      { label: "w/c 1 Oct", answered: 1, accuracy: null },
      { label: "w/c 8 Oct", answered: 14, accuracy: 50 },
    ]);
    expect(shortDay("2026-10-19")).toBe("19 Oct");
  });
});

describe("onboarding form", () => {
  const schema = onboardingSchema(2026);
  const base = { name: "Priya", preferredLanguage: "python", targets: [] };

  it("accepts a complete fresher profile", () => {
    const result = schema.safeParse({
      ...base,
      profileType: "FRESHER",
      college: "Example Institute",
      degree: "B.Tech",
      branch: "CSE",
      gradYear: "2027",
      cgpaBand: "7.0–7.9",
      hasBacklogs: false,
    });
    expect(result.success).toBe(true);
  });

  it("requires experienced details only for experienced candidates", () => {
    const result = schema.safeParse({
      ...base,
      profileType: "EXPERIENCED",
      currentRole: "SE",
      yearsExperience: "3",
      techStack: "Java, SQL",
    });
    expect(
      result.success && result.data.profileType === "EXPERIENCED" && result.data.techStack,
    ).toEqual(["Java", "SQL"]);
    expect(schema.safeParse({ ...base, profileType: "EXPERIENCED" }).success).toBe(false);
  });

  it("limits target companies to 3", () => {
    const targets = ["a", "b", "c", "d"].map((companyId) => ({ companyId }));
    const result = schema.safeParse({
      ...base,
      profileType: "EXPERIENCED",
      currentRole: "SE",
      yearsExperience: "3",
      targets,
    });
    expect(result.success).toBe(false);
  });
});
