"use client";

import {
  Bar,
  BarChart,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  useChartHeight,
  useChartWidth,
  XAxis,
  YAxis,
  type DotItemDotProps,
} from "recharts";
import { BLOOD, PEN_CIRCLE_PATH } from "@/components/cycle/marks";
import { placeTags, TAG_H, TAG_W } from "@/lib/domain/progress-periods";

/**
 * Week-by-week progress of one exercise: the headline number (top-set
 * weight, best reps or best time) as a line, and the volume / total as bars
 * underneath. Two small charts instead of one with two axes, so each is
 * read on its own scale. Every number is also in the table below, so the
 * charts are decorative for screen readers apart from their summary label.
 *
 * A week with a session on a logged period day is a "period point"
 * (CycProgress): a red dot inside the red pen circle, with the tilted
 * "BLOOD BANK DOWN" tag above it (below, if it would clip the top or
 * cover a neighbouring tag).
 */
export interface ProgressPoint {
  label: string;
  primary: number;
  secondary: number;
  /** a session this week fell on a period day */
  period?: boolean;
}

const INK = "#1B1B1B";
const RED = "#E0412B";
const PAPER = "#FFFDF8";
const tick = { fill: INK, fontSize: 10, fontWeight: 800, fontFamily: "var(--font-mono)" };

/** The pen circle around a period point, px (CycProgress: 40). */
const CIRCLE = 40;
/** Room the x-axis takes under the plot, px (Recharts' default axis height). */
const AXIS_H = 30;

const isPeriod = (payload: unknown) => Boolean((payload as ProgressPoint | undefined)?.period);

/** Every week's dot: plain ink, or red inside the red pen circle on a period week. */
function WeekDot({ cx, cy, payload }: DotItemDotProps) {
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  if (!isPeriod(payload)) return <circle cx={cx} cy={cy} r={3.5} fill={INK} stroke={INK} />;
  return (
    <g data-testid="period-point">
      <path
        d={PEN_CIRCLE_PATH}
        transform={`translate(${cx - CIRCLE / 2} ${cy - CIRCLE / 2}) scale(${CIRCLE / 100})`}
        fill="none"
        stroke={BLOOD}
        strokeWidth={2.6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={cx} cy={cy} r={4} fill={BLOOD} stroke={INK} strokeWidth={1.5} />
    </g>
  );
}

/**
 * The tilted "BLOOD BANK DOWN" tag of a period week. Drawn by a second,
 * invisible line so every tag sits above all dots and value labels; placed
 * with every point in view (see placeTags), one tag per run of period weeks.
 */
function PeriodTag({ index, points }: DotItemDotProps) {
  const width = useChartWidth() ?? 0;
  const height = useChartHeight() ?? 0;
  const tag = placeTags(
    points.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0, period: isPeriod(p.payload) })),
    { width, height: height - AXIS_H },
  )[index];
  if (!tag) return null;
  return (
    <g aria-hidden="true" transform={`rotate(-6 ${tag.x + TAG_W / 2} ${tag.y + TAG_H / 2})`}>
      <rect x={tag.x} y={tag.y} width={TAG_W} height={TAG_H} fill={BLOOD} />
      <text
        x={tag.x + TAG_W / 2}
        y={tag.y + TAG_H / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={PAPER}
        fontSize={9}
        fontWeight={800}
        letterSpacing="0.04em"
        fontFamily="var(--font-mono)"
      >
        BLOOD BANK DOWN
      </text>
    </g>
  );
}

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
  // Room above the line for the tag when any week is circled.
  const circled = points.some((p) => p.period);
  return (
    <figure aria-label={summary} className="m-0" data-testid="progress-chart">
      <div aria-hidden="true">
        <p className="text-[10px] font-extrabold tracking-[0.04em] text-muted">{primaryTitle}</p>
        <div className={`${circled ? "h-[160px]" : "h-[120px]"} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={circled ? { top: 46, right: 22, bottom: 0, left: 22 } : { top: 18, right: 16, bottom: 0, left: 16 }}
              accessibilityLayer={false}
            >
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: INK, strokeWidth: 2 }} tick={tick} interval="preserveStartEnd" />
              <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
              <Line
                type="linear"
                dataKey="primary"
                stroke={INK}
                strokeWidth={2.5}
                dot={(props: DotItemDotProps) => <WeekDot {...props} />}
                isAnimationActive={false}
              >
                <LabelList dataKey="primary" position="top" style={{ ...tick, fontSize: 10 }} />
              </Line>
              {circled ? (
                <Line
                  type="linear"
                  dataKey="primary"
                  stroke="none"
                  dot={(props: DotItemDotProps) => <PeriodTag {...props} />}
                  activeDot={false}
                  legendType="none"
                  isAnimationActive={false}
                />
              ) : null}
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
