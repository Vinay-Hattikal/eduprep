// The mock-test clock (PRD 4.6). Pure, so the browser timer and the server agree, and the
// rules are unit-tested. The server is the source of truth: the browser only displays it.
//
// FREE navigation:       one timer for the whole test; every section is open.
// SEQUENTIAL navigation: one section at a time, each with its own timer. When a section's time
//                        runs out the next starts automatically; finishing early starts the next
//                        one sooner. Earlier sections can't be reopened.

export type SectionNavigation = "FREE" | "SEQUENTIAL";

export type SectionTiming = { minutes: number };

/** Answers arriving this long after a deadline still count (network delay, slow phones). */
export const GRACE_MS = 15_000;

export type ClockInput = {
  navigation: SectionNavigation;
  sections: readonly SectionTiming[];
  startedAt: Date;
  /** ISO times sections were started early (sequential); index = section. */
  sectionStarts: readonly (string | null)[];
  now: Date;
};

export type ClockState = {
  /** Section open now (sequential) or null when every section is open (free). */
  current: number | null;
  /** Each section's [start, end] in ms since epoch. Free: every section spans the whole test. */
  windows: { start: number; end: number }[];
  /** When the test ends at the latest, given what's happened so far. */
  endsAt: number;
  remainingMs: number;
  expired: boolean;
};

const MINUTE = 60_000;

/** Latest possible end: every section uses its full time. */
export function maxEnd(startedAt: Date, sections: readonly SectionTiming[]): Date {
  return new Date(startedAt.getTime() + sections.reduce((sum, s) => sum + s.minutes, 0) * MINUTE);
}

export function sittingClock(input: ClockInput): ClockState {
  const now = input.now.getTime();
  const started = input.startedAt.getTime();

  if (input.navigation === "FREE") {
    const end = maxEnd(input.startedAt, input.sections).getTime();
    return {
      current: null,
      windows: input.sections.map(() => ({ start: started, end })),
      endsAt: end,
      remainingMs: Math.max(0, end - now),
      expired: now >= end,
    };
  }

  const windows: ClockState["windows"] = [];
  let start = started;
  for (const [index, section] of input.sections.entries()) {
    const fullEnd = start + section.minutes * MINUTE;
    // Moving on early closes this section and opens the next one at that moment.
    const next = input.sectionStarts[index + 1];
    const movedOn = next ? new Date(next).getTime() : NaN;
    const end =
      Number.isFinite(movedOn) && movedOn >= start && movedOn < fullEnd ? movedOn : fullEnd;
    windows.push({ start, end });
    start = end;
  }
  const currentIndex = windows.findIndex((w) => now < w.end);
  const endsAt = windows.at(-1)?.end ?? started;
  return {
    current: currentIndex === -1 ? null : currentIndex,
    windows,
    endsAt,
    remainingMs: currentIndex === -1 ? 0 : windows[currentIndex]!.end - now,
    expired: currentIndex === -1,
  };
}

/** May an answer in `section` be saved now? Allows GRACE_MS after the section closes. */
export function canAnswer(clock: ClockState, section: number, now: Date): boolean {
  const window = clock.windows[section];
  if (!window) return false;
  const t = now.getTime();
  return t >= window.start && t <= window.end + GRACE_MS;
}

/** Sequential: may the student move from section `from` to the next one now? */
export function canAdvance(clock: ClockState, from: number, sectionCount: number): boolean {
  return clock.current === from && from < sectionCount - 1;
}
