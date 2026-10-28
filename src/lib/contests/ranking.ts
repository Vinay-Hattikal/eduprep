// All-India mock tests (D-049): phases, ranking and percentiles. Pure functions.

export type ContestPhase = "upcoming" | "live" | "closing" | "final";

export type ContestTimes = { startsAt: Date; endsAt: Date; durationMinutes: number };

/** Grace after the last possible finish, for auto-submission to catch up. */
export const RESULT_GRACE_MS = 5 * 60 * 1000;

/** When every sitting must be over: the last start plus the test's length (and grace). */
export function resultsAt({ endsAt, durationMinutes }: ContestTimes): Date {
  return new Date(endsAt.getTime() + durationMinutes * 60_000 + RESULT_GRACE_MS);
}

/**
 * upcoming: not open yet · live: students can start · closing: no new starts, sittings still
 * running · final: ranks are final and solutions are open.
 */
export function contestPhase(times: ContestTimes, now: Date): ContestPhase {
  if (now < times.startsAt) return "upcoming";
  if (now <= times.endsAt) return "live";
  if (now < resultsAt(times)) return "closing";
  return "final";
}

export type Ranked<T> = T & { rank: number; percentile: number };

export type RankInput = { score: number; timeSec: number; submittedAt: Date };

/**
 * Orders finished sittings: higher score first, then less time taken, then earlier submission.
 * Equal score and time share a rank ("1, 2, 2, 4"). Percentile is the share of candidates who
 * scored the same or lower, as national exams report it, to two decimals.
 */
export function rankSittings<T extends RankInput>(rows: readonly T[]): Ranked<T>[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.score - a.score ||
      a.timeSec - b.timeSec ||
      a.submittedAt.getTime() - b.submittedAt.getTime(),
  );
  const total = sorted.length;
  // Candidates at or below each score: walk the distinct scores from lowest, adding up.
  const perScore = new Map<number, number>();
  for (const row of sorted) perScore.set(row.score, (perScore.get(row.score) ?? 0) + 1);
  const atOrBelow = new Map<number, number>();
  let cumulative = 0;
  for (const score of [...perScore.keys()].sort((a, b) => a - b)) {
    cumulative += perScore.get(score)!;
    atOrBelow.set(score, cumulative);
  }

  let rank = 0;
  return sorted.map((row, index) => {
    const previous = sorted[index - 1];
    if (!previous || previous.score !== row.score || previous.timeSec !== row.timeSec)
      rank = index + 1;
    return {
      ...row,
      rank,
      percentile: Math.round((atOrBelow.get(row.score)! / total) * 10_000) / 100,
    };
  });
}

/** "Top 3%" style label for a rank, or null when it isn't flattering enough to show. */
export function topShareLabel(rank: number, total: number): string | null {
  if (total < 10) return null;
  const share = (rank / total) * 100;
  if (share > 25) return null;
  const rounded = share < 1 ? 1 : Math.ceil(share);
  return `Top ${rounded}%`;
}
