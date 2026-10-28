import { describe, expect, it } from "vitest";
import { flagQuestion } from "@/lib/content/analytics";
import { canAdvance, canAnswer, GRACE_MS, maxEnd, sittingClock } from "@/lib/tests/clock";
import { percentile, scoreItem, scoreSections } from "@/lib/tests/scoring";

const start = new Date("2026-10-19T10:00:00Z");
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
const sections = [{ minutes: 20 }, { minutes: 30 }, { minutes: 10 }];

describe("sitting clock", () => {
  it("free navigation: one timer, every section open", () => {
    const clock = sittingClock({
      navigation: "FREE",
      sections,
      startedAt: start,
      sectionStarts: [],
      now: at(25),
    });
    expect(clock.current).toBeNull();
    expect(clock.endsAt).toBe(at(60).getTime());
    expect(clock.remainingMs).toBe(35 * 60_000);
    expect(canAnswer(clock, 0, at(25))).toBe(true);
    expect(canAnswer(clock, 2, at(25))).toBe(true);
    expect(maxEnd(start, sections)).toEqual(at(60));
  });

  it("sequential: sections follow each other automatically", () => {
    const clock = sittingClock({
      navigation: "SEQUENTIAL",
      sections,
      startedAt: start,
      sectionStarts: [],
      now: at(25),
    });
    expect(clock.current).toBe(1);
    expect(clock.remainingMs).toBe(25 * 60_000);
    expect(canAnswer(clock, 0, at(25))).toBe(false);
    expect(canAnswer(clock, 1, at(25))).toBe(true);
    expect(canAnswer(clock, 2, at(25))).toBe(false);
  });

  it("sequential: moving on early closes the section and shifts the rest", () => {
    const clock = sittingClock({
      navigation: "SEQUENTIAL",
      sections,
      startedAt: start,
      sectionStarts: [null, at(5).toISOString()],
      now: at(6),
    });
    expect(clock.current).toBe(1);
    expect(clock.windows[0]).toEqual({ start: start.getTime(), end: at(5).getTime() });
    expect(clock.windows[1]).toEqual({ start: at(5).getTime(), end: at(35).getTime() });
    expect(clock.endsAt).toBe(at(45).getTime());
    expect(canAnswer(clock, 0, at(6))).toBe(false);
  });

  it("allows a short grace period after a section closes", () => {
    const clock = sittingClock({
      navigation: "SEQUENTIAL",
      sections,
      startedAt: start,
      sectionStarts: [],
      now: at(20),
    });
    expect(canAnswer(clock, 0, new Date(at(20).getTime() + GRACE_MS - 1))).toBe(true);
    expect(canAnswer(clock, 0, new Date(at(20).getTime() + GRACE_MS + 1))).toBe(false);
  });

  it("expires after the last section", () => {
    const clock = sittingClock({
      navigation: "SEQUENTIAL",
      sections,
      startedAt: start,
      sectionStarts: [],
      now: at(61),
    });
    expect(clock).toMatchObject({ current: null, expired: true, remainingMs: 0 });
  });

  it("only advances from the open section, never past the last", () => {
    const clock = sittingClock({
      navigation: "SEQUENTIAL",
      sections,
      startedAt: start,
      sectionStarts: [],
      now: at(1),
    });
    expect(canAdvance(clock, 0, 3)).toBe(true);
    expect(canAdvance(clock, 1, 3)).toBe(false);
    const last = sittingClock({
      navigation: "SEQUENTIAL",
      sections,
      startedAt: start,
      sectionStarts: [],
      now: at(55),
    });
    expect(canAdvance(last, 2, 3)).toBe(false);
  });

  it("ignores an early start that's out of order", () => {
    const clock = sittingClock({
      navigation: "SEQUENTIAL",
      sections,
      startedAt: start,
      sectionStarts: [null, "not a date", at(70).toISOString()],
      now: at(1),
    });
    expect(clock.windows.map((w) => (w.end - start.getTime()) / 60_000)).toEqual([20, 50, 60]);
  });
});

describe("scoring", () => {
  const rules = { name: "Aptitude", marksPerItem: 2, negativeMarks: 0.5 };
  const key = {
    type: "SINGLE" as const,
    correctOptions: ["B"],
    numericAnswer: null,
    tolerance: null,
  };

  it("marks right, wrong and skipped MCQs", () => {
    expect(
      scoreItem(
        { kind: "mcq", section: 0, key, selectedOptions: ["B"], numericAnswer: null },
        rules,
      ),
    ).toEqual({ answered: true, isCorrect: true, marks: 2 });
    expect(
      scoreItem(
        { kind: "mcq", section: 0, key, selectedOptions: ["A"], numericAnswer: null },
        rules,
      ),
    ).toEqual({ answered: true, isCorrect: false, marks: -0.5 });
    expect(
      scoreItem({ kind: "mcq", section: 0, key, selectedOptions: [], numericAnswer: null }, rules),
    ).toEqual({ answered: false, isCorrect: null, marks: 0 });
  });

  it("gives coding marks from the best submission", () => {
    const coding = { name: "Coding", marksPerItem: 10, negativeMarks: 0 };
    expect(scoreItem({ kind: "coding", section: 1, bestScore: 0.6 }, coding)).toEqual({
      answered: true,
      isCorrect: false,
      marks: 6,
    });
    expect(scoreItem({ kind: "coding", section: 1, bestScore: 1 }, coding).isCorrect).toBe(true);
    expect(scoreItem({ kind: "coding", section: 1, bestScore: null }, coding).answered).toBe(false);
  });

  it("totals sections", () => {
    const items = [
      { kind: "mcq" as const, section: 0, key, selectedOptions: ["B"], numericAnswer: null },
      { kind: "mcq" as const, section: 0, key, selectedOptions: ["C"], numericAnswer: null },
      { kind: "coding" as const, section: 1, bestScore: 0.5 },
    ];
    const sectionRules = [rules, { name: "Coding", marksPerItem: 10, negativeMarks: 0 }];
    const scored = items.map((item) => ({
      ...item,
      score: scoreItem(item, sectionRules[item.section]!),
    }));
    const totals = scoreSections(sectionRules, scored);
    expect(totals.score).toBe(6.5);
    expect(totals.maxScore).toBe(14);
    expect(totals.sections[0]).toMatchObject({ score: 1.5, attempted: 2, correct: 1, total: 2 });
  });

  it("computes percentiles only with enough sittings", () => {
    expect(percentile(10, [1, 2, 3])).toBeNull();
    expect(percentile(10, [5, 6, 10, 12, 20])).toBe(50);
    expect(percentile(30, [5, 6, 10, 12, 20])).toBe(100);
  });
});

describe("content analytics flags", () => {
  const base = {
    attempts: 100,
    correct: 50,
    medianTimeSec: 60,
    expectedTimeSec: 60,
    correctOptions: ["A"],
    optionCounts: { A: 50, B: 20, C: 20, D: 10 },
  };

  it("needs enough answers before flagging", () => {
    expect(flagQuestion({ ...base, attempts: 5, correct: 0 })).toEqual([]);
  });

  it("spots a likely wrong answer key", () => {
    expect(
      flagQuestion({ ...base, correct: 10, optionCounts: { A: 10, B: 80, C: 5, D: 5 } }),
    ).toEqual(["wrong-key"]);
  });

  it("spots a popular distractor, easy and hard questions, and slow ones", () => {
    expect(
      flagQuestion({ ...base, optionCounts: { A: 45, B: 45, C: 5, D: 5 }, correct: 45 }),
    ).toEqual(["distractor"]);
    expect(flagQuestion({ ...base, correct: 99, optionCounts: { A: 99, B: 1 } })).toEqual([
      "too-easy",
    ]);
    expect(
      flagQuestion({ ...base, correct: 10, optionCounts: { A: 10, B: 18, C: 18, D: 18 } }),
    ).toEqual(["too-hard"]);
    expect(flagQuestion({ ...base, medianTimeSec: 200 })).toEqual(["slow"]);
    expect(flagQuestion(base)).toEqual([]);
  });
});
