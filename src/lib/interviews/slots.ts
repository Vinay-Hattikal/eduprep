// The slot engine (PRD 8.7, D-039). Pure: interviewer hours + days off + existing bookings in,
// bookable start times out. The booking service re-checks a slot inside a locked transaction.

import { addDaysLocal, dateKey, localDateOf, weekdayOf, zonedToUtc } from "@/lib/time/zones";

export type WeeklyRule = { weekday: number; startMinute: number; endMinute: number };

export type SlotInput = {
  rules: readonly WeeklyRule[];
  /** Days off as "YYYY-MM-DD" in the interviewer's zone. */
  blockedDates: readonly string[];
  /** Active bookings and holds of this interviewer. */
  busy: readonly { start: Date; end: Date }[];
  timeZone: string;
  durationMin: number;
  /** Gap kept free around every booking. */
  bufferMin: number;
  /** Slots start on this grid (minutes from midnight). */
  stepMin?: number;
  /** Earliest allowed start (now + minimum notice). */
  earliest: Date;
  /** How many days ahead to offer. */
  days?: number;
};

const MINUTE = 60_000;

export function availableSlots(input: SlotInput): Date[] {
  const step = input.stepMin ?? 30;
  const days = input.days ?? 14;
  const blocked = new Set(input.blockedDates);
  const buffer = input.bufferMin * MINUTE;
  const duration = input.durationMin * MINUTE;
  const first = localDateOf(input.earliest, input.timeZone);
  const slots = new Set<number>();

  for (let offset = 0; offset <= days; offset++) {
    const day = addDaysLocal(first, offset);
    if (blocked.has(dateKey(day))) continue;
    const weekday = weekdayOf(day);
    for (const rule of input.rules) {
      if (rule.weekday !== weekday) continue;
      // Align to the grid so slots look tidy (10:00, 10:30…), whatever the rule's start.
      const firstMinute = Math.ceil(rule.startMinute / step) * step;
      for (let minute = firstMinute; minute + input.durationMin <= rule.endMinute; minute += step) {
        const start = zonedToUtc(day, minute, input.timeZone).getTime();
        if (start < input.earliest.getTime()) continue;
        const end = start + duration;
        const clash = input.busy.some(
          (b) => start < b.end.getTime() + buffer && b.start.getTime() - buffer < end,
        );
        if (!clash) slots.add(start);
      }
    }
  }
  return [...slots].sort((a, b) => a - b).map((t) => new Date(t));
}

export function isSlotAvailable(input: SlotInput, start: Date): boolean {
  return availableSlots(input).some((slot) => slot.getTime() === start.getTime());
}

/** Rules must be inside a day, at least `minLength` long and not overlap on the same weekday. */
export function checkRules(rules: readonly WeeklyRule[], minLength = 30): string | null {
  for (const r of rules) {
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6)
      return "Pick a day of the week.";
    if (r.startMinute < 0 || r.endMinute > 24 * 60 || r.endMinute - r.startMinute < minLength) {
      return `Each block must be at least ${minLength} minutes, within one day.`;
    }
  }
  for (let d = 0; d < 7; d++) {
    const day = rules.filter((r) => r.weekday === d).sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < day.length; i++) {
      if (day[i]!.startMinute < day[i - 1]!.endMinute) return "Two blocks on the same day overlap.";
    }
  }
  return null;
}
