// Interview rules (PRD 8.7): rubrics, rescheduling and refunds, earnings, quality review.
// Numbers come from settings; the rules are pure and unit-tested.

export type RubricItem = { key: string; label: string; description: string };
export type Score = { key: string; score: number; comment: string };

/**
 * The rubric lines to show for a submitted scorecard. Rubrics can be edited after interviews
 * happen (D-055): items added later weren't scored, so they're skipped, and scores for items
 * that were removed still show, labelled from their key.
 */
export function scorecardItems(
  rubric: readonly RubricItem[],
  scores: readonly Score[],
): { key: string; label: string; score: Score }[] {
  const items: { key: string; label: string; score: Score }[] = [];
  for (const item of rubric) {
    const score = scores.find((s) => s.key === item.key);
    if (score) items.push({ key: item.key, label: item.label, score });
  }
  for (const score of scores) {
    if (rubric.some((item) => item.key === score.key)) continue;
    const label = score.key.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    items.push({ key: score.key, label, score });
  }
  return items;
}

/** Default rubrics per interview type slug (seeded; editable per type later). */
export const DEFAULT_RUBRICS: Record<string, RubricItem[]> = {
  hr: [
    {
      key: "communication",
      label: "Communication",
      description: "Clear, structured, concise answers.",
    },
    {
      key: "self-awareness",
      label: "Self-awareness",
      description: "Knows strengths, gaps and goals.",
    },
    {
      key: "examples",
      label: "Examples",
      description: "Concrete stories (situation, action, result).",
    },
    {
      key: "attitude",
      label: "Attitude and fit",
      description: "Curiosity, ownership, professionalism.",
    },
  ],
  "technical-fresher": [
    {
      key: "problem-solving",
      label: "Problem solving",
      description: "Breaks the problem down, finds an approach.",
    },
    { key: "coding", label: "Coding", description: "Correct, readable code; handles edge cases." },
    {
      key: "fundamentals",
      label: "CS fundamentals",
      description: "OOP, DBMS, OS, networks basics.",
    },
    {
      key: "communication",
      label: "Communication",
      description: "Thinks aloud, explains trade-offs.",
    },
  ],
  "company-specific": [
    {
      key: "problem-solving",
      label: "Problem solving",
      description: "Approach to the company's typical questions.",
    },
    { key: "coding", label: "Coding", description: "Correct, readable code under time pressure." },
    { key: "fundamentals", label: "Fundamentals", description: "Topics this company asks about." },
    {
      key: "communication",
      label: "Communication and fit",
      description: "Clarity, attitude, company knowledge.",
    },
  ],
  "sde-experienced": [
    {
      key: "problem-solving",
      label: "Problem solving",
      description: "Optimal approach, complexity analysis.",
    },
    { key: "coding", label: "Coding quality", description: "Clean, idiomatic, tested code." },
    {
      key: "depth",
      label: "Technical depth",
      description: "Depth in their stack and past projects.",
    },
    { key: "communication", label: "Communication", description: "Collaboration and clarity." },
  ],
  "system-design": [
    {
      key: "requirements",
      label: "Requirements",
      description: "Clarifies scope, scale and constraints.",
    },
    {
      key: "architecture",
      label: "Architecture",
      description: "Sensible components, data flow, APIs.",
    },
    {
      key: "trade-offs",
      label: "Trade-offs",
      description: "Consistency, availability, cost, bottlenecks.",
    },
    {
      key: "depth",
      label: "Deep dives",
      description: "Storage, caching, scaling one part in detail.",
    },
    {
      key: "communication",
      label: "Communication",
      description: "Drives the discussion, structured.",
    },
  ],
};

export const RECOMMENDATION_LABELS = {
  HIRE: "Ready: would pass",
  BORDERLINE: "Borderline",
  NOT_YET: "Not yet",
} as const;

/** Problems with a scorecard's scores, or null. Every rubric item needs a 1-5 score. */
export function checkScores(
  rubric: readonly RubricItem[],
  scores: readonly Score[],
): string | null {
  for (const item of rubric) {
    const score = scores.find((s) => s.key === item.key);
    if (!score || !Number.isInteger(score.score) || score.score < 1 || score.score > 5) {
      return `Score "${item.label}" from 1 to 5.`;
    }
    if (score.comment.length > 2000) return `The comment for "${item.label}" is too long.`;
  }
  if (scores.some((s) => !rubric.some((r) => r.key === s.key))) return "Unknown rubric item.";
  return null;
}

export function averageScore(scores: readonly Score[]): number {
  return scores.length
    ? Math.round((scores.reduce((n, s) => n + s.score, 0) / scores.length) * 10) / 10
    : 0;
}

const HOUR = 3_600_000;

/** Candidates can move or cancel (getting the credit back) until `windowHours` before the start. */
export function withinFreeChangeWindow(startsAt: Date, now: Date, windowHours: number): boolean {
  return startsAt.getTime() - now.getTime() >= windowHours * HOUR;
}

export type CancelBy = "candidate" | "interviewer" | "admin";

/**
 * What a cancellation does with the candidate's credit:
 * the interviewer or the platform cancelling always returns it; the candidate gets it back only
 * inside the free window (PRD 8.7).
 */
export function cancellationRefundsCredit(
  by: CancelBy,
  startsAt: Date,
  now: Date,
  windowHours: number,
): boolean {
  if (by !== "candidate") return true;
  return withinFreeChangeWindow(startsAt, now, windowHours);
}

/** The interviewer's share of the price, in paise (rounded down to the rupee). */
export function interviewerEarning(pricePaise: number, sharePercent: number): number {
  return Math.floor((pricePaise * sharePercent) / 100 / 100) * 100;
}

export const MIN_RATINGS_FOR_REVIEW = 5;

/** Low ratings or repeated no-shows put an interviewer under review (PRD 8.7 quality control). */
export function needsReview(
  stats: { ratingSum: number; ratingCount: number; noShows: number },
  minRatingPercent: number,
): boolean {
  if (stats.noShows >= 2) return true;
  if (stats.ratingCount < MIN_RATINGS_FOR_REVIEW) return false;
  return (stats.ratingSum / stats.ratingCount / 5) * 100 < minRatingPercent;
}

export function averageRating(stats: { ratingSum: number; ratingCount: number }): number | null {
  return stats.ratingCount ? Math.round((stats.ratingSum / stats.ratingCount) * 10) / 10 : null;
}
