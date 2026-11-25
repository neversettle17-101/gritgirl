"use client";

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

/**
 * Stacked bar per day: active minutes split into run / strength / walk
 * (mockup 3 palette: run = ink, strength = red, walk = ink hatching).
 * The numbers are also in the rows below, so the chart is decorative for
 * screen readers apart from its summary label.
 */
export interface WeekChartDay {
  label: string;
  running: number;
  strength: number;
  walking: number;
}

const INK = "#1B1B1B";
const RED = "#E0412B";
const WALK_PATTERN = "gg-walk-hatch";

export function WeekChart({ days, summary }: { days: WeekChartDay[]; summary: string }) {
  return (
    <figure aria-label={summary} className="m-0" data-testid="week-chart">
      {/* The pattern lives in its own SVG so every bar can reference it. */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <pattern id={WALK_PATTERN} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="2" height="4" fill={INK} />
          </pattern>
        </defs>
      </svg>
      <div aria-hidden="true" className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={{ top: 6, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%" accessibilityLayer={false}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: INK, strokeWidth: 2 }}
              tick={{ fill: INK, fontSize: 11, fontWeight: 800, fontFamily: "var(--font-mono)" }}
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
