"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const TIME_ZONE = "Asia/Kolkata";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d);
const dayLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
const timeLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);

/**
 * Free slots grouped by day (IST). Renders radio inputs named `startsAt`, so the surrounding
 * form posts the choice even without JavaScript.
 */
export function SlotPicker({ slots, name = "startsAt" }: { slots: string[]; name?: string }) {
  const days = useMemo(() => {
    const map = new Map<string, { label: string; times: { iso: string; label: string }[] }>();
    for (const iso of slots) {
      const date = new Date(iso);
      const key = dayKey(date);
      const day = map.get(key) ?? { label: dayLabel(date), times: [] };
      day.times.push({ iso, label: timeLabel(date) });
      map.set(key, day);
    }
    return [...map.entries()];
  }, [slots]);
  const [day, setDay] = useState(days[0]?.[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const current = days.find(([key]) => key === day)?.[1];

  if (!days.length)
    return <p className="text-sm text-muted-foreground">No free times in the next two weeks.</p>;

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-medium">Pick a time (IST)</legend>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Days">
        {days.map(([key, d]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === day}
            onClick={() => setDay(key)}
            className={cn(
              "shrink-0 rounded-lg border px-3 py-2 text-sm whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              key === day
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-secondary/50",
            )}
          >
            {d.label}
            <span className="block text-xs opacity-80">{d.times.length} free</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" data-testid="slot-times">
        {current?.times.map((t) => (
          <label
            key={t.iso}
            className={cn(
              "cursor-pointer rounded-lg border px-2 py-2 text-center text-sm font-medium tabular-nums transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              picked === t.iso
                ? "border-primary bg-primary/10 text-primary"
                : "hover:bg-secondary/50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={t.iso}
              required
              className="sr-only"
              onChange={() => setPicked(t.iso)}
            />
            {t.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
