/**
 * Local calendar-date helpers for `YYYY-MM-DD` strings.
 *
 * Arithmetic runs on UTC midnights, so neither the runtime time zone nor DST
 * can shift a date. A date string never carries a time or zone.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** True for a real calendar date in `YYYY-MM-DD` form (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(date: string): number {
  if (!isIsoDate(date)) throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`);
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Whole days from `a` to `b` (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** Every date from `from` to `to`, inclusive. Empty when from > to. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = toUtc(from), end = toUtc(to); d <= end; d += DAY_MS) out.push(fromUtc(d));
  return out;
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date "now" in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** First and last day of the month containing `date`. */
export function monthBounds(date: string): { from: string; to: string } {
  const [y, m] = date.split("-").map(Number) as [number, number];
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${from.slice(0, 8)}${String(last).padStart(2, "0")}` };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** "25 NOV" (receipt style). */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]}`;
}

/** "NOV 2026". */
export function monthLabel(date: string): string {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function weekdayShort(day: number): string {
  return WEEKDAYS[day]!;
}
