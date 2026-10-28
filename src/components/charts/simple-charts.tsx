"use client";

// Small single-series charts (dataviz rules: thin marks, 4px rounded data-ends, recessive
// hairline grid, one hue, hover/focus tooltip, a table view; no legend for one series).

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ChartPoint = { label: string; value: number | null; detail?: string };

const HEIGHT = 180;
const PAD = { top: 12, right: 16, bottom: 24, left: 34 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry!.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Labels count back from the latest point, so the newest is always labelled and never crowded. */
function showLabel(index: number, count: number, every: number): boolean {
  return (count - 1 - index) % every === 0;
}

/** Keep edge labels inside the chart. */
function anchorFor(index: number, count: number): "start" | "middle" | "end" {
  if (count > 1 && index === count - 1) return "end";
  if (count > 1 && index === 0) return "start";
  return "middle";
}

function niceMax(max: number): number {
  if (max <= 0) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  // Even multiples keep the middle gridline a whole number (no "2.5 questions").
  for (const multiple of [1, 2, 4, 6, 8, 10]) if (multiple * step >= max) return multiple * step;
  return 10 * step;
}

export type ValueFormat = "count" | "percent" | "seconds";

const FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  count: (v) => Math.round(v).toLocaleString("en-IN"),
  percent: (v) => `${Math.round(v)}%`,
  seconds: (v) => `${Math.round(v)}s`,
};

type ChartProps = {
  data: ChartPoint[];
  /** Shown above the chart; also the accessible name. */
  title: string;
  /**
   * How values are written on axes, tooltips and the table. A name, not a function, so
   * server components can pass it to these client charts.
   */
  valueFormat?: ValueFormat;
  /** Fixed y-axis maximum (e.g. 100 for percentages). */
  max?: number;
  /** Show every nth x label. */
  labelEvery?: number;
  valueHeader?: string;
};

function Tooltip({
  x,
  point,
  format,
}: {
  x: number;
  point: ChartPoint;
  format: (v: number) => string;
}) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
      style={{ left: x }}
    >
      <p className="font-medium">{point.label}</p>
      <p className="text-muted-foreground">
        {point.value === null ? "No data" : format(point.value)}
        {point.detail ? ` · ${point.detail}` : ""}
      </p>
    </div>
  );
}

function TableView({
  data,
  format,
  valueHeader,
}: {
  data: ChartPoint[];
  format: (v: number) => string;
  valueHeader: string;
}) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        Show as table
      </summary>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-surface text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Period</th>
              <th className="px-3 py-1.5 text-right font-medium">{valueHeader}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((point) => (
              <tr key={point.label}>
                <td className="px-3 py-1.5">{point.label}</td>
                <td className="tabular px-3 py-1.5 text-right">
                  {point.value === null ? "—" : format(point.value)}
                  {point.detail ? (
                    <span className="text-muted-foreground"> · {point.detail}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function YAxis({
  max,
  width,
  format,
}: {
  max: number;
  width: number;
  format: (v: number) => string;
}) {
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  return (
    <>
      {[0, 0.5, 1].map((fraction) => {
        const y = PAD.top + plotHeight * (1 - fraction);
        return (
          <g key={fraction}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y}
              y2={y}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y}
              dy="0.32em"
              textAnchor="end"
              className="tabular fill-muted-foreground text-[10px]"
            >
              {format(max * fraction)}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** Columns from one baseline, e.g. questions answered per day. */
export function ColumnChart({
  data,
  title,
  valueFormat = "count",
  max,
  labelEvery = 1,
  valueHeader = "Value",
}: ChartProps) {
  const format = FORMATTERS[valueFormat];
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const top = max ?? niceMax(Math.max(0, ...data.map((d) => d.value ?? 0)));
  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = data.length ? plotWidth / data.length : 0;
  const barWidth = Math.max(2, Math.min(24, slot - 2));

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div ref={ref} className="relative" onMouseLeave={() => setActive(null)}>
        {width > 0 ? (
          <svg width={width} height={HEIGHT} role="img" aria-label={title}>
            <YAxis max={top} width={width} format={format} />
            {data.map((point, i) => {
              const value = point.value ?? 0;
              const h = top ? (value / top) * plotHeight : 0;
              const x = PAD.left + i * slot + (slot - barWidth) / 2;
              const y = PAD.top + plotHeight - h;
              const r = Math.min(4, h, barWidth / 2);
              return (
                <g
                  key={point.label}
                  tabIndex={0}
                  role="img"
                  aria-label={`${point.label}: ${point.value === null ? "no data" : format(point.value)}${point.detail ? `, ${point.detail}` : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                >
                  {/* Hit target: the full slot, bigger than the mark. */}
                  <rect
                    x={PAD.left + i * slot}
                    y={PAD.top}
                    width={slot}
                    height={plotHeight}
                    fill="transparent"
                  />
                  {h > 0 ? (
                    <path
                      // Rounded data-end at the top, square at the baseline.
                      d={`M${x},${y + h} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} H${x + barWidth - r} A${r},${r} 0 0 1 ${x + barWidth},${y + r} V${y + h} Z`}
                      className={cn(
                        "fill-chart-1 transition-opacity",
                        active !== null && active !== i && "opacity-40",
                      )}
                    />
                  ) : null}
                  {showLabel(i, data.length, labelEvery) ? (
                    <text
                      x={PAD.left + i * slot + slot / 2}
                      y={HEIGHT - 6}
                      textAnchor={anchorFor(i, data.length)}
                      className="fill-muted-foreground text-[10px]"
                    >
                      {point.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
        {active !== null && data[active] ? (
          <Tooltip x={PAD.left + active * slot + slot / 2} point={data[active]!} format={format} />
        ) : null}
      </div>
      <TableView data={data} format={format} valueHeader={valueHeader} />
    </figure>
  );
}

/** A 2px line with end-dots, e.g. accuracy per week. Gaps where there's no data. */
export function LineChart({
  data,
  title,
  valueFormat = "count",
  max,
  labelEvery = 1,
  valueHeader = "Value",
}: ChartProps) {
  const format = FORMATTERS[valueFormat];
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const top = max ?? niceMax(Math.max(0, ...data.map((d) => d.value ?? 0)));
  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const xOf = (i: number) => PAD.left + (data.length > 1 ? i * step : plotWidth / 2);
  const yOf = (v: number) => PAD.top + plotHeight - (top ? (v / top) * plotHeight : 0);

  // Split the line where values are missing.
  const segments: string[] = [];
  let current = "";
  data.forEach((point, i) => {
    if (point.value === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${xOf(i)},${yOf(point.value)}`;
  });
  if (current) segments.push(current);

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div
        ref={ref}
        className="relative"
        onMouseLeave={() => setActive(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const index = data.length > 1 ? Math.round((x - PAD.left) / step) : 0;
          setActive(Math.max(0, Math.min(data.length - 1, index)));
        }}
      >
        {width > 0 ? (
          <svg width={width} height={HEIGHT} role="img" aria-label={title}>
            <YAxis max={top} width={width} format={format} />
            {active !== null ? (
              <line
                x1={xOf(active)}
                x2={xOf(active)}
                y1={PAD.top}
                y2={PAD.top + plotHeight}
                className="stroke-border"
                strokeWidth={1}
              />
            ) : null}
            {segments.map((d) => (
              <path
                key={d}
                d={d}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-chart-1"
              />
            ))}
            {data.map((point, i) => (
              <g key={point.label}>
                {point.value !== null ? (
                  <circle
                    cx={xOf(i)}
                    cy={yOf(point.value)}
                    r={active === i ? 5 : 4}
                    strokeWidth={2}
                    tabIndex={0}
                    role="img"
                    aria-label={`${point.label}: ${format(point.value)}${point.detail ? `, ${point.detail}` : ""}`}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="fill-chart-1 stroke-card outline-none"
                  />
                ) : null}
                {showLabel(i, data.length, labelEvery) ? (
                  <text
                    x={xOf(i)}
                    y={HEIGHT - 6}
                    textAnchor={anchorFor(i, data.length)}
                    className="fill-muted-foreground text-[10px]"
                  >
                    {point.label}
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
        {active !== null && data[active] ? (
          <Tooltip x={xOf(active)} point={data[active]!} format={format} />
        ) : null}
      </div>
      <TableView data={data} format={format} valueHeader={valueHeader} />
    </figure>
  );
}
