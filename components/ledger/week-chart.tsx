"use client";

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, type XAxisTickContentProps } from "recharts";
import { BLOOD } from "@/components/cycle/marks";

/**
 * Stacked bar per day (or per month, on the Year ledger): active minutes split into run / strength / walk
 * (mockup 3 palette: run = ink, strength = red, walk = ink hatching).
 * The numbers are also in the rows below, so the chart is decorative for
 * screen readers apart from its summary label.
 *
 * A logged period day (CycWeek) gets a small red drop under its tick.
 */
export interface WeekChartDay {
  label: string;
  running: number;
  strength: number;
  walking: number;
  /** A logged period day: draws a small blood drop under the tick. */
  period?: boolean;
}

const INK = "#1B1B1B";
const RED = "#E0412B";
const WALK_PATTERN = "gg-walk-hatch";
const TICK_STYLE = { fill: INK, fontSize: 11, fontWeight: 800, fontFamily: "var(--font-mono)" } as const;
/** BloodDrop's path (24 × 28 box), drawn inside the chart's SVG. */
const DROP_PATH = "M12 1C9 7 4 11 4 17a8 8 0 0 0 16 0c0-6-5-10-8-16z";

function PeriodTick({ x, y, payload, days }: XAxisTickContentProps & { days: WeekChartDay[] }) {
  const cx = Number(x);
  const cy = Number(y);
  return (
    <g>
      <text x={cx} y={cy} dy="0.71em" textAnchor="middle" {...TICK_STYLE}>
        {payload.value}
      </text>
      {days[payload.index]?.period ? (
        <path d={DROP_PATH} fill={BLOOD} transform={`translate(${cx - 3.5} ${cy + 14}) scale(${7 / 24})`} data-testid="period-tick" />
      ) : null}
    </g>
  );
}

export function WeekChart({
  days,
  summary,
  testId = "week-chart",
  height = 150,
}: {
  days: WeekChartDay[];
  summary: string;
  testId?: string;
  height?: number;
}) {
  const anyPeriod = days.some((d) => d.period);
  return (
    <figure aria-label={summary} className="m-0" data-testid={testId}>
      {/* The pattern lives in its own SVG so every bar can reference it. */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <pattern id={WALK_PATTERN} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="2" height="4" fill={INK} />
          </pattern>
        </defs>
      </svg>
      <div aria-hidden="true" className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={{ top: 6, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%" accessibilityLayer={false}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: INK, strokeWidth: 2 }}
              tick={anyPeriod ? (props: XAxisTickContentProps) => <PeriodTick {...props} days={days} /> : TICK_STYLE}
              height={anyPeriod ? 34 : 30}
            />
            <YAxis hide allowDecimals={false} />
            <Bar dataKey="running" stackId="m" fill={INK} isAnimationActive={false} />
            <Bar dataKey="strength" stackId="m" fill={RED} isAnimationActive={false} />
            <Bar dataKey="walking" stackId="m" fill={`url(#${WALK_PATTERN})`} stroke={INK} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
