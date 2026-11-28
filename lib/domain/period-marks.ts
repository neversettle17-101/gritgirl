import { addDays, daysBetween } from "@/lib/domain/dates";
import { MAX_PERIOD_GAP_DAYS } from "@/lib/domain/cycle";

/**
 * "Blood bank down" marks: which logged period days to circle, and which day
 * of that period each one is ("DAY 1", "DAY 2" …).
 *
 * Periods are grouped the same way the cycle engine does it: consecutive
 * logged days at most MAX_PERIOD_GAP_DAYS + 1 apart belong to one period, so
 * a single forgotten day doesn't restart the count. The day number counts
 * calendar days from the period's first day (a bridged gap still counts).
 */
export interface PeriodMark {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** 1-based day within its period. */
  day: number;
}

/** How far before a range to read, so the first visible day is numbered right. */
export const PERIOD_LOOKBACK_DAYS = 15;

export function periodMarks(dates: readonly string[]): PeriodMark[] {
  const sorted = [...new Set(dates)].sort();
  const out: PeriodMark[] = [];
  let start: string | null = null;
  let prev: string | null = null;
  for (const d of sorted) {
    if (start === null || prev === null || daysBetween(prev, d) > MAX_PERIOD_GAP_DAYS + 1) start = d;
    out.push({ date: d, day: daysBetween(start, d) + 1 });
    prev = d;
  }
  return out;
}

/** Marks within [from, to] (inclusive), numbered using every date given. */
export function periodMarksIn(dates: readonly string[], range: { from: string; to: string }): PeriodMark[] {
  return periodMarks(dates).filter((m) => m.date >= range.from && m.date <= range.to);
}

/** The read window for a range: the range plus the lookback. */
export function periodReadWindow(range: { from: string; to: string }): { from: string; to: string } {
  return { from: addDays(range.from, -PERIOD_LOOKBACK_DAYS), to: range.to };
}

/** Receipt label: "DAY 1". */
export const periodDayLabel = (m: Pick<PeriodMark, "day">): string => `DAY ${m.day}`;
