import { readinessBand } from "@/lib/learning/readiness";
import { cn } from "@/lib/utils";

const BAND_STYLES = {
  ready: { stroke: "stroke-success", label: "Ready" },
  building: { stroke: "stroke-primary", label: "Building" },
  low: { stroke: "stroke-warning", label: "Early days" },
} as const;

type ReadinessRingProps = {
  score: number | null;
  /** Diameter in px. */
  size?: number;
  label: string;
  className?: string;
};

/**
 * Readiness meter (design-system.md: readiness ring). The track is a lighter step of the
 * fill's own hue; the band is also written out, so meaning never rests on colour alone.
 */
export function ReadinessRing({ score, size = 112, label, className }: ReadinessRingProps) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = score ?? 0;
  const band = score === null ? null : BAND_STYLES[readinessBand(value)];

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score ?? undefined}
      aria-valuetext={
        score === null ? "Not enough data yet" : `${value}% ready, ${band!.label.toLowerCase()}`
      }
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={cn(band?.stroke ?? "stroke-muted", band && "opacity-15")}
        />
        {score !== null && value > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
            className={cn(
              band!.stroke,
              "transition-[stroke-dasharray] duration-700 ease-[var(--ease-standard)]",
            )}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="numeral text-[1.75rem] leading-none font-bold">
          {score === null ? "—" : `${value}%`}
        </span>
        <span className="text-[0.6875rem] text-muted-foreground">
          {band ? band.label : "No data"}
        </span>
      </div>
    </div>
  );
}
