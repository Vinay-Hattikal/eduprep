// Calendar days in India Standard Time. Limits and streaks reset at IST midnight, whatever the
// server's time zone. A "day" is a Date at 00:00 UTC carrying the IST calendar date, which is
// how Postgres DATE columns round-trip through Prisma.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function istDay(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

export function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

/** Whole days from `from` to `to` (both IST days). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}
