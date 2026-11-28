import { addDays, monthShort } from "./dates";
import { periodMarks } from "./period-marks";

/**
 * Pure helpers for the Profile → Cycle desk card: the 7-day strip, the
 * DAY 1 / DAY 2 fields, and what STAMP IT has to send.
 */

/** The 7 dates of the week starting on `weekStart`. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** "NOV", or "NOV / DEC" for a week across two months. */
export function stripMonthLabel(weekStart: string): string {
  const a = monthShort(weekStart);
  const b = monthShort(addDays(weekStart, 6));
  return a === b ? a : `${a} / ${b}`;
}

/**
 * The first two days of the most recent period among `dates` (grouped like
 * the ledgers do it), for the DAY 1 / DAY 2 fields. Missing ones are null.
 */
export function currentPeriodDays(dates: Iterable<string>): [string | null, string | null] {
  const marks = periodMarks([...dates]);
  let start = -1;
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i]!.day === 1) {
      start = i;
      break;
    }
  }
  if (start < 0) return [null, null];
  return [marks[start]?.date ?? null, marks[start + 1]?.date ?? null];
}

/** What changed between the saved days and the edited ones. */
export function diffMarks(saved: ReadonlySet<string>, edited: ReadonlySet<string>): { add: string[]; remove: string[] } {
  return {
    add: [...edited].filter((d) => !saved.has(d)).sort(),
    remove: [...saved].filter((d) => !edited.has(d)).sort(),
  };
}

/**
 * A typed DAY 1 / DAY 2 change: the old day is unmarked and the new one
 * marked. An empty or future `next` only unmarks.
 */
export function retypeDay(marked: ReadonlySet<string>, prev: string | null, next: string, today: string): Set<string> {
  const out = new Set(marked);
  if (prev) out.delete(prev);
  if (next && next <= today) out.add(next);
  return out;
}
