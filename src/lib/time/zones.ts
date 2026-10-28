// Time-zone arithmetic with the platform's Intl data (no library). Interviewers set their hours in
// their own zone; candidates see slots in theirs (IST by default).

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

export type LocalDate = { year: number; month: number; day: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The wall-clock date and time of an instant in a time zone. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday!]!,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset of a zone from UTC at an instant, in minutes (IST = +330). */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, 0, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** The instant when the wall clock in `timeZone` shows `date` at `minute` minutes past midnight. */
export function zonedToUtc(date: LocalDate, minute: number, timeZone: string): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day, 0, minute);
  // Two passes settle the offset around daylight-saving changes.
  let guess = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000;
  guess = naive - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess);
}

export function localDateOf(date: Date, timeZone: string): LocalDate {
  const { year, month, day } = zonedParts(date, timeZone);
  return { year, month, day };
}

export function addDaysLocal(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function weekdayOf(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** "2026-10-19" */
export function dateKey(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function parseDateKey(key: string): LocalDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = addDaysLocal(date, 0);
  return dateKey(check) === key ? date : null;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** "Mon, 20 Oct, 7:30 pm" in a zone. */
export function formatSlot(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    date,
  );
}

export function formatDay(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** "19:30" for a minute of the day. */
export function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
