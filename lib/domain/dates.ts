/**
 * Local calendar dates. `activities.date` is the user's local date
 * (YYYY-MM-DD), never a UTC timestamp, so "today" depends on the user's
 * time zone (user_settings.timezone).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const get = (type: string) => fmt.formatToParts(now).find((p) => p.type === type)?.value ?? "00";
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}

/** The local date in `timeZone`, e.g. "2026-11-25". Falls back to UTC for an unknown zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    const p = parts(now, timeZone);
    return `${p.y}-${p.m}-${p.d}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The local wall-clock time in `timeZone`, "HH:MM". */
export function timeIn(timeZone: string, now: Date = new Date()): string {
  try {
    const p = parts(now, timeZone);
    return `${p.hh}:${p.mm}`;
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Calendar arithmetic on YYYY-MM-DD strings (no time zone involved). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Receipt style: "SAT 28 NOV". */
export function formatReceiptDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
