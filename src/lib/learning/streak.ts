// Daily practice streak in IST days, with streak freezes (D-052).
//
// A freeze covers one missed day: practise again after missing days you hold freezes for, and the
// streak carries on (frozen days don't add to it). Freezes are earned every `earnEvery` streak
// days, up to `maxFreezes`, and can also be bought with points.

import { addDays, daysBetween } from "@/lib/learning/dates";

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: Date | null;
  streakFreezes?: number;
};

export type FreezeRules = { earnEvery: number; maxFreezes: number };

/** No freezes: the plain streak. */
const NO_FREEZES: FreezeRules = { earnEvery: 0, maxFreezes: 0 };

export type StreakUpdate = StreakState & {
  streakFreezes: number;
  /** Freezes used by this activity (missed days covered). */
  frozeDays: number;
  /** The last missed day a freeze covered, when frozeDays > 0. */
  lastFreezeOn: Date | null;
  /** A freeze was earned by this activity. */
  earnedFreeze: boolean;
};

/** The streak after practising on `today`. */
export function recordActivity(
  state: StreakState,
  today: Date,
  rules: FreezeRules = NO_FREEZES,
): StreakUpdate {
  const freezes = state.streakFreezes ?? 0;
  const unchanged = {
    ...state,
    streakFreezes: freezes,
    frozeDays: 0,
    lastFreezeOn: null,
    earnedFreeze: false,
  };
  const gap = state.lastActiveDate ? daysBetween(state.lastActiveDate, today) : null;
  if (gap !== null && gap <= 0) return unchanged; // already counted today (or clock went back)

  const missed = gap === null ? 0 : gap - 1;
  const continues = gap !== null && missed <= freezes;
  const frozeDays = continues ? missed : 0;
  const current = continues ? state.currentStreak + 1 : 1;

  let left = freezes - frozeDays;
  const earnedFreeze =
    rules.earnEvery > 0 && current % rules.earnEvery === 0 && left < rules.maxFreezes;
  if (earnedFreeze) left += 1;

  return {
    currentStreak: current,
    longestStreak: Math.max(state.longestStreak, current),
    lastActiveDate: today,
    streakFreezes: left,
    frozeDays,
    lastFreezeOn: frozeDays > 0 ? addDays(today, -1) : null,
    earnedFreeze,
  };
}

/**
 * The streak to show today: alive while today or yesterday was active, or while the student
 * holds enough freezes to cover the days missed since.
 */
export function visibleStreak(state: StreakState, today: Date): number {
  if (!state.lastActiveDate) return 0;
  const missed = daysBetween(state.lastActiveDate, today) - 1;
  return missed <= (state.streakFreezes ?? 0) ? state.currentStreak : 0;
}

/** Days the student can still miss, from today, before the streak is lost. */
export function streakSafeDays(state: StreakState, today: Date): number | null {
  if (!state.lastActiveDate || visibleStreak(state, today) === 0) return null;
  const missedSoFar = Math.max(0, daysBetween(state.lastActiveDate, today) - 1);
  return (state.streakFreezes ?? 0) - missedSoFar;
}
