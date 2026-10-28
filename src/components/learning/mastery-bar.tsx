import { MASTERY_LABELS, masteryLevel } from "@/lib/learning/mastery";
import { cn } from "@/lib/utils";

const FILL = {
  new: "bg-muted-foreground/30",
  weak: "bg-warning",
  fair: "bg-primary",
  strong: "bg-success",
} as const;

/** One topic's mastery as a thin horizontal meter with the value and level written out. */
export function MasteryBar({
  score,
  attempts,
  label,
  className,
}: {
  score: number;
  attempts: number;
  label: string;
  className?: string;
}) {
  const level = masteryLevel(score, attempts);
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{attempts ? `${score}%` : "—"}</span> ·{" "}
          {MASTERY_LABELS[level]}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${label} mastery`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", FILL[level])}
          style={{ width: `${Math.max(score, attempts ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}
