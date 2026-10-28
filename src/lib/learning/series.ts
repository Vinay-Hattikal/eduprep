// Shapes daily activity for the progress charts.

export type DayActivity = { day: string; answered: number; correct: number };
export type WeekAccuracy = { label: string; answered: number; accuracy: number | null };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-19" → "19 Oct" */
export function shortDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

/**
 * Accuracy per 7-day block, ending with the latest day (oldest first). Weeks with fewer
 * than `minAnswers` answers have no accuracy, so one lucky answer doesn't look like 100%.
 */
export function weeklyAccuracy(days: DayActivity[], minAnswers = 3): WeekAccuracy[] {
  const weeks: WeekAccuracy[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const block = days.slice(Math.max(0, end - 7), end);
    const answered = block.reduce((sum, d) => sum + d.answered, 0);
    const correct = block.reduce((sum, d) => sum + d.correct, 0);
    weeks.unshift({
      label: `w/c ${shortDay(block[0]!.day)}`,
      answered,
      accuracy: answered >= minAnswers ? Math.round((correct / answered) * 100) : null,
    });
  }
  return weeks;
}
