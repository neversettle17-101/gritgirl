import { formatSpan } from "@/lib/domain/dates";
import type { PeriodMark } from "@/lib/domain/period-marks";

/**
 * Ledger helpers for the "blood bank down" marks (CycWeek / CycMonth): look a
 * day's mark up, and group a month's marks into the date span of each period.
 */

/** date → mark, for per-day lookups while rendering rows and cells. */
export function marksByDate(marks: readonly PeriodMark[] | undefined): Map<string, PeriodMark> {
  return new Map((marks ?? []).map((m) => [m.date, m]));
}

/**
 * The span of each period among the marks in [from, to], in date order. A
 * period restarts at DAY 1; a period already running when the range starts
 * begins at its first visible day.
 */
export function periodSpans(
  marks: readonly PeriodMark[] | undefined,
  range: { from: string; to: string },
): { from: string; to: string }[] {
  const spans: { from: string; to: string }[] = [];
  const inRange = (marks ?? []).filter((m) => m.date >= range.from && m.date <= range.to).sort((a, b) => a.date.localeCompare(b.date));
  let prev: PeriodMark | null = null;
  for (const m of inRange) {
    const last = spans.at(-1);
    if (!last || !prev || m.day <= prev.day) spans.push({ from: m.date, to: m.date });
    else last.to = m.date;
    prev = m;
  }
  return spans;
}

/** "24 – 25 NOV", or "24 NOV" for a single day; several periods joined with " · ". */
export function formatPeriodSpans(spans: readonly { from: string; to: string }[]): string {
  return spans.map((s) => (s.from === s.to ? formatSpan(s.from, s.to).replace(/^\d+ – /, "") : formatSpan(s.from, s.to))).join(" · ");
}
