"use client";

import { Bar, BarChart, LabelList, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

/**
 * Week-by-week progress of one exercise: the headline number (top-set
 * weight, best reps or best time) as a line, and the volume / total as bars
 * underneath. Two small charts instead of one with two axes, so each is
 * read on its own scale. Every number is also in the table below, so the
 * charts are decorative for screen readers apart from their summary label.
 */
export interface ProgressPoint {
  label: string;
  primary: number;
  secondary: number;
}

const INK = "#1B1B1B";
const RED = "#E0412B";
const tick = { fill: INK, fontSize: 10, fontWeight: 800, fontFamily: "var(--font-mono)" };

export function ProgressChart({
  points,
  primaryTitle,
  secondaryTitle,
  summary,
}: {
  points: ProgressPoint[];
  primaryTitle: string;
  secondaryTitle: string;
  summary: string;
}) {
  return (
    <figure aria-label={summary} className="m-0" data-testid="progress-chart">
      <div aria-hidden="true">
        <p className="text-[10px] font-extrabold tracking-[0.04em] text-muted">{primaryTitle}</p>
        <div className="h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 18, right: 16, bottom: 0, left: 16 }} accessibilityLayer={false}>
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: INK, strokeWidth: 2 }} tick={tick} interval="preserveStartEnd" />
              <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
              <Line
                type="linear"
                dataKey="primary"
                stroke={INK}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: INK, stroke: INK }}
                isAnimationActive={false}
              >
                <LabelList dataKey="primary" position="top" style={{ ...tick, fontSize: 10 }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[10px] font-extrabold tracking-[0.04em] text-muted">{secondaryTitle}</p>
        <div className="h-[90px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 14, right: 0, bottom: 0, left: 0 }} barCategoryGap="28%" accessibilityLayer={false}>
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: INK, strokeWidth: 2 }} tick={tick} interval="preserveStartEnd" />
              <YAxis hide />
              <Bar dataKey="secondary" fill={RED} isAnimationActive={false}>
                <LabelList dataKey="secondary" position="top" style={{ ...tick, fontSize: 9 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  );
}
