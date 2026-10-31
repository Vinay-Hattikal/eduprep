"use client";

import { cn } from "@/lib/utils";

import { STATE_STYLES, type PaletteState } from "@/components/exam/palette-styles";

export type { PaletteState };

export const STATE_LABELS: Record<PaletteState, string> = {
  answered: "Answered",
  "not-answered": "Not answered",
  review: "Marked for review",
  "answered-review": "Answered and marked",
  "not-visited": "Not visited",
};

export function PaletteLegend({ counts }: { counts: Record<PaletteState, number> }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
      {(Object.keys(STATE_LABELS) as PaletteState[]).map((state) => (
        <li key={state} className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums",
              STATE_STYLES[state],
            )}
          >
            {counts[state]}
          </span>
          <span className="text-muted-foreground">{STATE_LABELS[state]}</span>
        </li>
      ))}
    </ul>
  );
}

/** Numbered buttons, one per question, coloured by state (the real exam palette). */
export function QuestionPalette({
  items,
  currentId,
  onSelect,
}: {
  items: { id: string; number: number; state: PaletteState; locked: boolean }[];
  currentId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ol className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5" aria-label="Questions">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            disabled={item.locked}
            aria-current={item.id === currentId ? "step" : undefined}
            aria-label={`Question ${item.number}: ${STATE_LABELS[item.state]}`}
            data-state={item.state}
            className={cn(
              "flex size-9 items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
              STATE_STYLES[item.state],
              item.id === currentId && "scale-110 outline-2 outline-offset-2 outline-foreground",
            )}
          >
            {item.number}
          </button>
        </li>
      ))}
    </ol>
  );
}
