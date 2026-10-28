// Badges (D-052). Pure definitions shared by the server (awarding) and pages (display).
// A badge id never changes once released; earned badges are stored by id.

export type BadgeGroup = "streak" | "practice" | "tests" | "coding" | "community";

export type BadgeDefinition = {
  name: string;
  description: string;
  group: BadgeGroup;
  /** Bronze, silver, gold: for the medal colour. */
  tier: 1 | 2 | 3;
};

export const BADGE_GROUPS: Record<BadgeGroup, string> = {
  streak: "Streaks",
  practice: "Practice",
  tests: "Mock tests",
  coding: "Coding",
  community: "Community",
};

export const BADGES = {
  "streak-3": {
    name: "Warming up",
    description: "Practise 3 days in a row.",
    group: "streak",
    tier: 1,
  },
  "streak-7": {
    name: "On a roll",
    description: "Practise 7 days in a row.",
    group: "streak",
    tier: 1,
  },
  "streak-30": {
    name: "Habit formed",
    description: "Practise 30 days in a row.",
    group: "streak",
    tier: 2,
  },
  "streak-100": {
    name: "Unstoppable",
    description: "Practise 100 days in a row.",
    group: "streak",
    tier: 3,
  },
  "answers-100": {
    name: "Century",
    description: "Answer 100 questions.",
    group: "practice",
    tier: 1,
  },
  "answers-500": {
    name: "Five hundred",
    description: "Answer 500 questions.",
    group: "practice",
    tier: 2,
  },
  "answers-2000": {
    name: "Question bank",
    description: "Answer 2,000 questions.",
    group: "practice",
    tier: 3,
  },
  "first-test": {
    name: "Test taker",
    description: "Finish your first mock test.",
    group: "tests",
    tier: 1,
  },
  "tests-10": {
    name: "Exam ready",
    description: "Finish 10 mock tests.",
    group: "tests",
    tier: 2,
  },
  "contest-debut": {
    name: "All-India debut",
    description: "Take part in an All-India mock test.",
    group: "tests",
    tier: 1,
  },
  "contest-top-10": {
    name: "Top 10%",
    description: "Finish in the top 10% of an All-India mock test.",
    group: "tests",
    tier: 2,
  },
  "contest-top-1": {
    name: "Top 1%",
    description: "Finish in the top 1% of an All-India mock test.",
    group: "tests",
    tier: 3,
  },
  "first-solve": {
    name: "First accepted",
    description: "Solve your first coding problem.",
    group: "coding",
    tier: 1,
  },
  "solved-25": {
    name: "Problem solver",
    description: "Solve 25 coding problems.",
    group: "coding",
    tier: 2,
  },
  contributor: {
    name: "Contributor",
    description: "Share an interview experience or drive report that gets approved.",
    group: "community",
    tier: 1,
  },
  helpful: {
    name: "Helpful",
    description: "Get 10 upvotes on one discussion comment.",
    group: "community",
    tier: 2,
  },
} as const satisfies Record<string, BadgeDefinition>;

export type BadgeId = keyof typeof BADGES;

export const BADGE_IDS = Object.keys(BADGES) as BadgeId[];

export function isBadgeId(value: string): value is BadgeId {
  return Object.hasOwn(BADGES, value);
}

const STREAK_BADGES: [number, BadgeId][] = [
  [3, "streak-3"],
  [7, "streak-7"],
  [30, "streak-30"],
  [100, "streak-100"],
];
const ANSWER_BADGES: [number, BadgeId][] = [
  [100, "answers-100"],
  [500, "answers-500"],
  [2000, "answers-2000"],
];
const TEST_BADGES: [number, BadgeId][] = [
  [1, "first-test"],
  [10, "tests-10"],
];
const SOLVE_BADGES: [number, BadgeId][] = [
  [1, "first-solve"],
  [25, "solved-25"],
];

const reached = (thresholds: [number, BadgeId][], value: number) =>
  thresholds.filter(([at]) => value >= at).map(([, id]) => id);

/**
 * Badges whose threshold was crossed between two stat snapshots. Usually empty, so the caller
 * only writes when something was earned.
 */
export function crossedStatBadges(
  before: { longestStreak: number; totalAttempts: number },
  after: { longestStreak: number; totalAttempts: number },
): BadgeId[] {
  const had = new Set([
    ...reached(STREAK_BADGES, before.longestStreak),
    ...reached(ANSWER_BADGES, before.totalAttempts),
  ]);
  return [
    ...reached(STREAK_BADGES, after.longestStreak),
    ...reached(ANSWER_BADGES, after.totalAttempts),
  ].filter((id) => !had.has(id));
}

/** Test badges for a number of finished tests. */
export function testBadges(finished: number): BadgeId[] {
  return reached(TEST_BADGES, finished);
}

/** Coding badges for a number of solved problems. */
export function solveBadges(solved: number): BadgeId[] {
  return reached(SOLVE_BADGES, solved);
}

/** Contest badges for a final percentile. */
export function contestBadges(percentile: number): BadgeId[] {
  return [
    "contest-debut",
    ...(percentile >= 90 ? ["contest-top-10" as const] : []),
    ...(percentile >= 99 ? ["contest-top-1" as const] : []),
  ];
}

/** Upvotes on one comment that earn its author the "helpful" badge. */
export const HELPFUL_VOTES = 10;
