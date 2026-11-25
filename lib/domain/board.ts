/**
 * The Board (technical design §8): Day / Week / Month ledgers.
 *
 * Pure functions: resolve the date range for a view, aggregate activities per
 * local calendar day, total them up, and derive streaks. One payload feeds all
 * three ledgers; the UI only draws it.
 *
 * Rules (§8.4):
 *  - Minutes per type per day = sum of each activity's duration. Strength with
 *    no total duration counts the sum of its set times, or 0 when it has none.
 *  - A day is active when it has at least one activity.
 *  - Dates are the user's local calendar dates (YYYY-MM-DD), never UTC instants.
 *  - Streaks are derived from activity dates and never stored.
 */
import { effectiveDurationSec, TYPE_LABEL, type ActivityDetail, type ActivityType } from "./activity-types";
import { addDays, daysBetween } from "./dates";
import type { Feel } from "@/lib/validation/activities";

export const BOARD_VIEWS = ["day", "week", "month"] as const;
export type BoardView = (typeof BOARD_VIEWS)[number];

/** 0 = Sunday, 1 = Monday … 6 = Saturday (user_settings.week_starts_on). */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** How far back streaks look. A streak longer than this is reported as this long. */
export const STREAK_LOOKBACK_DAYS = 400;

export interface BoardRange {
  view: BoardView;
  /** the date asked for */
  date: string;
  /** the period itself: the day, the week, or the 1st..last of the month */
  start: string;
  end: string;
  /** the dates returned in `days`: same as start..end, except months are padded to whole weeks */
  from: string;
  to: string;
}

export type ByType = Record<ActivityType, number>;
export type CardioDistance = { running: number; walking: number };

export interface BoardActivity {
  id: string;
  type: ActivityType;
  title: string;
  /** "HH:MM" or null */
  startTime: string | null;
  /** recorded duration, else the strength set times; null when unknown */
  durationSec: number | null;
  distanceM: number | null;
  avgHeartRate: number | null;
  feel: Feel | null;
  notes: string | null;
  /** strength only (0 for runs and walks) */
  exerciseCount: number;
  setCount: number;
}

export interface BoardDay {
  date: string;
  /** false for the padding days before/after a month */
  inPeriod: boolean;
  minutesByType: ByType;
  /** sum of minutesByType */
  minutes: number;
  distanceM: CardioDistance;
  /** in time order (unknown start times last) */
  activities: BoardActivity[];
}

export interface BoardTotals {
  activeDays: number;
  minutes: number;
  workouts: number;
  runs: number;
  walks: number;
  strength: number;
  distanceM: CardioDistance;
}

export interface Streaks {
  /** consecutive active days ending at the period's reference day (see currentStreak) */
  current: number;
  /** the longest run of consecutive active days inside the period */
  longest: number;
}

export interface Board {
  range: BoardRange;
  today: string;
  days: BoardDay[];
  /** over the period only (start..end), never the month padding */
  totals: BoardTotals;
  streaks: Streaks;
}

// ───────── ranges ─────────

const dayOfWeek = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay();

/** The first day of the week containing `isoDate`. */
export function startOfWeek(isoDate: string, weekStartsOn: WeekStart): string {
  return addDays(isoDate, -((dayOfWeek(isoDate) - weekStartsOn + 7) % 7));
}

export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function endOfMonth(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${isoDate.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** Same day of month in the month `delta` months away (clamped: 31 Jan + 1 → 28/29 Feb). */
export function addMonths(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
  const last = Number(endOfMonth(first).slice(8));
  return `${first.slice(0, 8)}${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function resolveRange(view: BoardView, date: string, weekStartsOn: WeekStart): BoardRange {
  switch (view) {
    case "day":
      return { view, date, start: date, end: date, from: date, to: date };
    case "week": {
      const start = startOfWeek(date, weekStartsOn);
      const end = addDays(start, 6);
      return { view, date, start, end, from: start, to: end };
    }
    case "month": {
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      return {
        view,
        date,
        start,
        end,
        from: startOfWeek(start, weekStartsOn),
        to: addDays(startOfWeek(end, weekStartsOn), 6),
      };
    }
  }
}

/** The date that the ‹ / › arrows move to. */
export function shiftDate(view: BoardView, date: string, step: -1 | 1): string {
  if (view === "day") return addDays(date, step);
  if (view === "week") return addDays(date, 7 * step);
  return addMonths(date, step);
}

/** Every date from `from` to `to`, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const n = daysBetween(from, to);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDays(from, i));
}

export function normalizeWeekStart(n: number | null | undefined): WeekStart {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6 ? (n as WeekStart) : 1;
}

// ───────── aggregation ─────────

const zeroByType = (): ByType => ({ running: 0, walking: 0, strength: 0 });

/** Time order within a day: start time (unknown last), then creation. */
export function compareActivitiesAsc(
  a: Pick<ActivityDetail, "startTime" | "createdAt">,
  b: Pick<ActivityDetail, "startTime" | "createdAt">,
): number {
  const at = a.startTime ?? "99:99";
  const bt = b.startTime ?? "99:99";
  if (at !== bt) return at < bt ? -1 : 1;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

export function summarizeActivity(a: ActivityDetail): BoardActivity {
  return {
    id: a.id,
    type: a.type,
    title: TYPE_LABEL[a.type],
    startTime: a.startTime,
    durationSec: effectiveDurationSec(a),
    distanceM: a.distanceM,
    avgHeartRate: a.avgHeartRate,
    feel: a.feel,
    notes: a.notes,
    exerciseCount: a.exercises.length,
    setCount: a.exercises.reduce((n, ex) => n + ex.sets.length, 0),
  };
}

/** One ledger line per date in from..to. Activities outside the range are ignored. */
export function aggregateDays(activities: ActivityDetail[], range: Pick<BoardRange, "from" | "to" | "start" | "end">): BoardDay[] {
  const byDate = new Map<string, ActivityDetail[]>();
  for (const a of activities) {
    const list = byDate.get(a.date);
    if (list) list.push(a);
    else byDate.set(a.date, [a]);
  }

  return eachDate(range.from, range.to).map((date) => {
    const list = (byDate.get(date) ?? []).slice().sort(compareActivitiesAsc);
    const seconds = zeroByType();
    const distanceM: CardioDistance = { running: 0, walking: 0 };
    for (const a of list) {
      seconds[a.type] += effectiveDurationSec(a) ?? 0;
      if (a.type !== "strength") distanceM[a.type] += a.distanceM ?? 0;
    }
    const minutesByType: ByType = {
      running: Math.round(seconds.running / 60),
      walking: Math.round(seconds.walking / 60),
      strength: Math.round(seconds.strength / 60),
    };
    return {
      date,
      inPeriod: date >= range.start && date <= range.end,
      minutesByType,
      minutes: minutesByType.running + minutesByType.walking + minutesByType.strength,
      distanceM,
      activities: list.map(summarizeActivity),
    };
  });
}

export function totalize(days: BoardDay[]): BoardTotals {
  const t: BoardTotals = {
    activeDays: 0,
    minutes: 0,
    workouts: 0,
    runs: 0,
    walks: 0,
    strength: 0,
    distanceM: { running: 0, walking: 0 },
  };
  for (const d of days) {
    if (!d.inPeriod) continue;
    if (d.activities.length) t.activeDays += 1;
    t.minutes += d.minutes;
    t.workouts += d.activities.length;
    t.distanceM.running += d.distanceM.running;
    t.distanceM.walking += d.distanceM.walking;
    for (const a of d.activities) {
      if (a.type === "running") t.runs += 1;
      else if (a.type === "walking") t.walks += 1;
      else t.strength += 1;
    }
  }
  return t;
}

// ───────── streaks ─────────

/**
 * Consecutive active days ending on `asOf`. When `asOf` is today and nothing
 * is logged yet, the streak is still alive: it counts back from yesterday.
 */
export function currentStreak(activeDates: Iterable<string>, asOf: string, today: string): number {
  const active = new Set(activeDates);
  let day = asOf;
  if (!active.has(day)) {
    if (asOf !== today) return 0;
    day = addDays(day, -1);
  }
  let n = 0;
  while (active.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

/** The longest run of consecutive active days between from and to (inclusive). */
export function longestStreak(activeDates: Iterable<string>, from: string, to: string): number {
  const active = new Set(activeDates);
  let best = 0;
  let run = 0;
  for (const date of eachDate(from, to)) {
    run = active.has(date) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * The day a period's current streak is measured at: the day itself for the
 * day view, otherwise today if it falls inside the period, else its last day.
 */
export function streakReferenceDay(range: BoardRange, today: string): string {
  if (range.view === "day") return range.date;
  if (today >= range.start && today <= range.end) return today;
  return today < range.start ? range.start : range.end;
}

/**
 * The dates whose activity the current streak needs: a lookback window ending
 * at the reference day. (The longest streak only needs the period's own days.)
 */
export function streakWindow(range: BoardRange, today: string): { from: string; to: string } {
  const to = streakReferenceDay(range, today);
  return { from: addDays(to, -STREAK_LOOKBACK_DAYS), to };
}

// ───────── the whole board ─────────

/**
 * @param activities every activity dated range.from..range.to
 * @param streakDates dates with at least one activity in streakWindow(range, today)
 */
export function buildBoard(input: {
  range: BoardRange;
  today: string;
  activities: ActivityDetail[];
  streakDates: Iterable<string>;
}): Board {
  const { range, today } = input;
  const days = aggregateDays(input.activities, range);
  const active = new Set(input.streakDates);
  for (const d of days) if (d.activities.length) active.add(d.date);
  return {
    range,
    today,
    days,
    totals: totalize(days),
    streaks: {
      current: currentStreak(active, streakReferenceDay(range, today), today),
      longest: longestStreak(active, range.start, range.end),
    },
  };
}

/**
 * Home's three shortcut numbers from this month's board (whose padded weeks
 * always include all of this week): minutes today, minutes this week so far,
 * and workouts this month.
 */
export function homeLedgerNumbers(month: Board, weekStartsOn: WeekStart): { day: number; week: number; month: number } {
  const { today } = month;
  const weekStart = startOfWeek(today, weekStartsOn);
  let day = 0;
  let week = 0;
  for (const d of month.days) {
    if (d.date === today) day = d.minutes;
    if (d.date >= weekStart && d.date <= today) week += d.minutes;
  }
  return { day, week, month: month.totals.workouts };
}
