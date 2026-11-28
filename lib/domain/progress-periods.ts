/**
 * "Blood bank down" on the progress charts: which week points to circle.
 *
 * The charts plot one point per logged week, so a week is a period point
 * when any session of the exercise in that week fell on a logged period day.
 * The exact dates are kept too, so the page can list them under the chart
 * ("BLOOD BANK DOWN · 24 – 25 NOV") and the grouping by week stays honest.
 *
 * Marks come from loadPeriodMarks(…, "progress"), which is already empty
 * when the "circle it on progress charts" switch is off.
 */
import { startOfWeek, type WeekStart } from "@/lib/domain/board";
import { addDays, formatReceiptDate, formatSpan } from "@/lib/domain/dates";
import type { PeriodMark } from "@/lib/domain/period-marks";
import type { ProgressSession } from "@/lib/domain/progress";

/** weekStart → the session dates in that week that were period days, ascending, unique. */
export type PeriodWeeks = ReadonlyMap<string, readonly string[]>;

/** The calendar range a set of sessions spans (to load marks for); null with no sessions. */
export function sessionRange(sessions: readonly Pick<ProgressSession, "date">[]): { from: string; to: string } | null {
  if (sessions.length === 0) return null;
  let from = sessions[0]!.date;
  let to = from;
  for (const s of sessions) {
    if (s.date < from) from = s.date;
    if (s.date > to) to = s.date;
  }
  return { from, to };
}

/** Groups the sessions that fell on a period day by the week they are plotted in. */
export function periodWeeks(
  sessions: readonly Pick<ProgressSession, "date">[],
  marks: readonly Pick<PeriodMark, "date">[],
  weekStartsOn: WeekStart,
): PeriodWeeks {
  const periodDays = new Set(marks.map((m) => m.date));
  const byWeek = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (!periodDays.has(s.date)) continue;
    const week = startOfWeek(s.date, weekStartsOn);
    const set = byWeek.get(week) ?? new Set<string>();
    set.add(s.date);
    byWeek.set(week, set);
  }
  const out = new Map<string, string[]>();
  for (const [week, dates] of [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    out.set(week, [...dates].sort());
  }
  return out;
}

/** Every period date that hit a session, ascending. */
export function periodHitDates(weeks: PeriodWeeks): string[] {
  return [...new Set([...weeks.values()].flat())].sort();
}

/**
 * Dates as runs of consecutive days: "24 – 25 NOV", "28 NOV",
 * "30 NOV – 1 DEC". Separate runs are joined with ", ".
 */
export function formatPeriodDates(dates: readonly string[]): string {
  const sorted = [...new Set(dates)].sort();
  const runs: { from: string; to: string }[] = [];
  for (const d of sorted) {
    const run = runs[runs.length - 1];
    if (run && addDays(run.to, 1) === d) run.to = d;
    else runs.push({ from: d, to: d });
  }
  return runs.map((r) => (r.from === r.to ? formatReceiptDate(r.from).slice(4) : formatSpan(r.from, r.to))).join(", ");
}

/** The line under a chart: "BLOOD BANK DOWN · 24 – 25 NOV"; null when nothing is circled. */
export function periodCaption(weeks: PeriodWeeks): string | null {
  const dates = periodHitDates(weeks);
  return dates.length ? `BLOOD BANK DOWN · ${formatPeriodDates(dates)}` : null;
}

// ───────── chart geometry: where each "BLOOD BANK DOWN" tag goes ─────────

/** The tag box, px (CycProgress: 9px caps, 3 × 5 padding). */
export const TAG_W = 96;
export const TAG_H = 15;

export interface TagBox {
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const tagRect = (t: TagBox): Box => ({ x: t.x, y: t.y, w: TAG_W, h: TAG_H });
const overlaps = (a: Box, b: Box, pad = 2) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
/** A plotted point's dot and the value label above it. */
const pointRect = (p: { x: number; y: number }): Box => ({ x: p.x - 14, y: p.y - 17, w: 28, h: 22 });

/**
 * Tags for a chart's points (pixel centres, left to right), as CycProgress
 * places them: just above the pen circle, nudged inside the chart's width,
 * and below the circle when above would clip the top.
 *
 * Back-to-back circled weeks are one period, so only the first of each run
 * gets a tag (null for the rest and for plain points). A tag that would
 * cover another tag, dot or value label tries below, then higher up, before
 * settling for the first position that fits.
 */
export function placeTags(
  points: readonly { x: number; y: number; period: boolean }[],
  size: { width: number; height: number },
): (TagBox | null)[] {
  const placed: TagBox[] = [];
  const maxX = Math.max(size.width - TAG_W - 2, 2);
  return points.map((p, i) => {
    if (!p.period || points[i - 1]?.period) return null;
    const x = Math.min(Math.max(p.x - 46, 2), maxX);
    const candidates = [
      { x, y: p.y - 40 },
      { x, y: p.y + 22 },
      { x, y: p.y - 40 - TAG_H - 4 },
    ];
    const fits = (t: TagBox) => t.y >= 0 && t.y + TAG_H <= size.height;
    const clear = (t: TagBox) =>
      !placed.some((q) => overlaps(tagRect(q), tagRect(t))) &&
      !points.some((q, j) => j !== i && overlaps(pointRect(q), tagRect(t), 0));
    const tag =
      candidates.find((t) => fits(t) && clear(t)) ??
      candidates.find((t) => fits(t) && !placed.some((q) => overlaps(tagRect(q), tagRect(t)))) ??
      candidates.find(fits) ??
      candidates[0]!;
    placed.push(tag);
    return tag;
  });
}
