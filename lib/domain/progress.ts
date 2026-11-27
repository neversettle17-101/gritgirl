/**
 * Per-exercise progress, week by week. Pure functions over the sessions the
 * exercise_progress database function returns (SI units: kg, seconds).
 *
 * Weeks follow user_settings.week_starts_on. `activities.date` is already
 * the user's local calendar date, so bucketing is calendar arithmetic; the
 * time zone (user_settings.timezone) only decides what "this week" is.
 *
 * Only weeks with at least one session are listed. "Change" always compares
 * a week with the previous logged week, so a week off does not read as a
 * collapse to zero.
 */
import type { Tracking } from "@/lib/domain/activity-types";
import { startOfWeek, type WeekStart } from "@/lib/domain/board";
import { addDays, formatReceiptDate, formatSpan, todayIn } from "@/lib/domain/dates";
import { formatSetTime, fromKg, type WeightUnit } from "@/lib/domain/units";

export interface ProgressSet {
  reps: number | null;
  durationSec: number | null;
  /** null = bodyweight */
  weightKg: number | null;
}

export interface ProgressSession {
  activityId: string;
  /** local calendar date, YYYY-MM-DD */
  date: string;
  sets: ProgressSet[];
}

export interface ExerciseHistory {
  exerciseId: string;
  name: string;
  tracking: Tracking;
  /** oldest first */
  sessions: ProgressSession[];
}

/**
 * How progress is measured:
 *   weighted   — heaviest set (kg × reps), then volume (Σ reps × kg)
 *   bodyweight — best set (reps), then total reps
 *   timed      — best set (time), then total time
 */
export type ProgressKind = "weighted" | "bodyweight" | "timed";

export type Trend = "up" | "flat" | "down";

export interface WeekStats {
  /** first day of the week (user's week start) */
  weekStart: string;
  /** last day of the week */
  weekEnd: string;
  sessions: number;
  sets: number;
  reps: number;
  /** Σ reps × kg over sets with both, kg */
  volumeKg: number;
  /** the heaviest set: most kg, then most reps; null when nothing was weighted */
  topSet: { weightKg: number; reps: number | null } | null;
  /** most reps in one set */
  bestReps: number | null;
  /** Σ per-set time, seconds */
  totalSec: number;
  /** longest single set, seconds */
  bestSec: number | null;
}

/** A pair of numbers in SI units (kg, reps or seconds, depending on the kind). */
export interface Metrics {
  /** headline: top-set kg / best-set reps / best-set seconds */
  primary: number;
  /** volume kg / total reps / total seconds */
  secondary: number;
}

export interface WeekRow extends WeekStats {
  metrics: Metrics;
  /** vs the previous logged week; null for the first */
  change: Metrics | null;
  trend: Trend | null;
}

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  kind: ProgressKind;
  /** logged weeks, oldest first */
  weeks: WeekRow[];
  /** latest logged week vs the one before; null with fewer than two weeks */
  trend: Trend | null;
  /** latest week vs the first logged week; null with fewer than two weeks */
  overall: Metrics | null;
  lastDone: string | null;
  /** the user's today and current week start (time zone aware) */
  today: string;
  thisWeekStart: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Weighted if any set carried weight; timed if it is a time exercise (or only has times); else bodyweight reps. */
export function progressKind(tracking: Tracking, sessions: readonly ProgressSession[]): ProgressKind {
  const sets = sessions.flatMap((s) => s.sets);
  if (sets.some((s) => isNum(s.weightKg) && s.weightKg > 0)) return "weighted";
  const anyReps = sets.some((s) => isNum(s.reps));
  const anyTime = sets.some((s) => isNum(s.durationSec));
  if (tracking === "time" ? anyTime || !anyReps : anyTime && !anyReps) return "timed";
  return "bodyweight";
}

/** Groups sessions into the weeks they fall in. Weeks with no sessions are omitted. Oldest first. */
export function bucketWeeks(sessions: readonly ProgressSession[], weekStartsOn: WeekStart): WeekStats[] {
  const byWeek = new Map<string, WeekStats>();
  for (const session of sessions) {
    const weekStart = startOfWeek(session.date, weekStartsOn);
    let w = byWeek.get(weekStart);
    if (!w) {
      w = {
        weekStart,
        weekEnd: addDays(weekStart, 6),
        sessions: 0,
        sets: 0,
        reps: 0,
        volumeKg: 0,
        topSet: null,
        bestReps: null,
        totalSec: 0,
        bestSec: null,
      };
      byWeek.set(weekStart, w);
    }
    w.sessions += 1;
    for (const s of session.sets) {
      w.sets += 1;
      const reps = isNum(s.reps) ? s.reps : null;
      const kg = isNum(s.weightKg) && s.weightKg > 0 ? s.weightKg : null;
      if (reps !== null) {
        w.reps += reps;
        w.bestReps = Math.max(w.bestReps ?? 0, reps);
      }
      if (reps !== null && kg !== null) w.volumeKg = round2(w.volumeKg + reps * kg);
      if (kg !== null) {
        const top = w.topSet;
        if (!top || kg > top.weightKg || (kg === top.weightKg && (reps ?? 0) > (top.reps ?? 0))) {
          w.topSet = { weightKg: kg, reps };
        }
      }
      if (isNum(s.durationSec)) {
        w.totalSec += s.durationSec;
        w.bestSec = Math.max(w.bestSec ?? 0, s.durationSec);
      }
    }
  }
  return [...byWeek.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

export function weekMetrics(w: WeekStats, kind: ProgressKind): Metrics {
  switch (kind) {
    case "weighted":
      return { primary: w.topSet?.weightKg ?? 0, secondary: w.volumeKg };
    case "bodyweight":
      return { primary: w.bestReps ?? 0, secondary: w.reps };
    case "timed":
      return { primary: w.bestSec ?? 0, secondary: w.totalSec };
  }
}

export function diffMetrics(cur: Metrics, prev: Metrics): Metrics {
  return { primary: round2(cur.primary - prev.primary), secondary: round2(cur.secondary - prev.secondary) };
}

/** Up / down by the headline number; when that is level, by the volume / total. */
export function trendOf(change: Metrics): Trend {
  const sign = Math.sign(change.primary) || Math.sign(change.secondary);
  return sign > 0 ? "up" : sign < 0 ? "down" : "flat";
}

export interface ProgressOptions {
  weekStartsOn: WeekStart;
  /** user_settings.timezone: decides today, and so the current week */
  timezone: string;
  now?: Date;
}

export function buildExerciseProgress(h: ExerciseHistory, o: ProgressOptions): ExerciseProgress {
  const today = todayIn(o.timezone, o.now);
  const kind = progressKind(h.tracking, h.sessions);
  const stats = bucketWeeks(h.sessions, o.weekStartsOn);
  const weeks: WeekRow[] = [];
  for (const w of stats) {
    const metrics = weekMetrics(w, kind);
    const prev = weeks[weeks.length - 1];
    const change = prev ? diffMetrics(metrics, prev.metrics) : null;
    weeks.push({ ...w, metrics, change, trend: change ? trendOf(change) : null });
  }
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const overall = first && last && weeks.length > 1 ? diffMetrics(last.metrics, first.metrics) : null;
  const lastDone = h.sessions.reduce<string | null>((m, s) => (m === null || s.date > m ? s.date : m), null);
  return {
    exerciseId: h.exerciseId,
    name: h.name,
    kind,
    weeks,
    trend: last?.trend ?? null,
    overall,
    lastDone,
    today,
    thisWeekStart: startOfWeek(today, o.weekStartsOn),
  };
}

// ───────── display (the user's weight unit) ─────────

/** "THIS WEEK", "LAST WEEK", else the span: "16 – 22 NOV". */
export function weekLabel(weekStart: string, weekEnd: string, thisWeekStart: string): string {
  if (weekStart === thisWeekStart) return "THIS WEEK";
  if (weekStart === addDays(thisWeekStart, -7)) return "LAST WEEK";
  return formatSpan(weekStart, weekEnd);
}

/** Short x-axis label: "16 NOV". */
export function weekTick(weekStart: string): string {
  return formatReceiptDate(weekStart).slice(4);
}

const U = (unit: WeightUnit) => unit.toUpperCase();
const signed = (n: number, body: string) => (n > 0 ? `+${body}` : n < 0 ? `−${body}` : `±${body}`);

/** Volume as a whole number in the user's unit: 1240.5 kg → "1,241". */
export function volumeIn(kg: number, unit: WeightUnit): number {
  return Math.round(fromKg(kg, unit));
}

const fmtInt = (n: number) => n.toLocaleString("en-US");

/** The headline of one week: "42.5 KG × 8", "12 REPS", "1:30". */
export function formatPrimary(w: WeekStats, kind: ProgressKind, unit: WeightUnit): string {
  switch (kind) {
    case "weighted":
      if (!w.topSet) return "BW";
      return `${fromKg(w.topSet.weightKg, unit)} ${U(unit)}${w.topSet.reps !== null ? ` × ${w.topSet.reps}` : ""}`;
    case "bodyweight":
      return `${w.bestReps ?? 0} REPS`;
    case "timed":
      return w.bestSec ? formatSetTime(w.bestSec) : "—";
  }
}

/** The second number of one week: "1,240 KG", "36 REPS", "4:30". */
export function formatSecondary(w: WeekStats, kind: ProgressKind, unit: WeightUnit): string {
  switch (kind) {
    case "weighted":
      return `${fmtInt(volumeIn(w.volumeKg, unit))} ${U(unit)}`;
    case "bodyweight":
      return `${w.reps} REPS`;
    case "timed":
      return formatSetTime(w.totalSec);
  }
}

/** A change in the headline: "+2.5 KG", "−1 REP", "+15s", "±0 KG". */
export function formatPrimaryChange(delta: number, kind: ProgressKind, unit: WeightUnit): string {
  const a = Math.abs(delta);
  switch (kind) {
    case "weighted":
      return signed(delta, `${fromKg(a, unit)} ${U(unit)}`);
    case "bodyweight":
      return signed(delta, `${a} ${a === 1 ? "REP" : "REPS"}`);
    case "timed":
      return signed(delta, formatSetTime(a));
  }
}

/** A change in the second number: "+40 KG", "−6 REPS", "+1:30". */
export function formatSecondaryChange(delta: number, kind: ProgressKind, unit: WeightUnit): string {
  const a = Math.abs(delta);
  switch (kind) {
    case "weighted":
      return signed(delta, `${fmtInt(volumeIn(a, unit))} ${U(unit)}`);
    case "bodyweight":
      return signed(delta, `${a} ${a === 1 ? "REP" : "REPS"}`);
    case "timed":
      return signed(delta, formatSetTime(a));
  }
}

/** Column / chart names per kind. */
export const KIND_LABELS: Record<ProgressKind, { primary: string; secondary: string }> = {
  weighted: { primary: "TOP SET", secondary: "VOLUME" },
  bodyweight: { primary: "BEST SET", secondary: "TOTAL REPS" },
  timed: { primary: "BEST SET", secondary: "TOTAL TIME" },
};

/** Chart values in display units (kg/lb; reps; minutes for totals, seconds for best set). */
export function chartPoint(w: WeekRow, kind: ProgressKind, unit: WeightUnit): { label: string; primary: number; secondary: number } {
  const label = weekTick(w.weekStart);
  switch (kind) {
    case "weighted":
      return { label, primary: w.topSet ? fromKg(w.topSet.weightKg, unit) : 0, secondary: volumeIn(w.volumeKg, unit) };
    case "bodyweight":
      return { label, primary: w.bestReps ?? 0, secondary: w.reps };
    case "timed":
      return { label, primary: w.bestSec ?? 0, secondary: Math.round((w.totalSec / 60) * 10) / 10 };
  }
}

export const TREND_LABEL: Record<Trend, string> = { up: "UP", flat: "LEVEL", down: "DOWN" };
export const TREND_GLYPH: Record<Trend, string> = { up: "▲", flat: "■", down: "▼" };

/**
 * The strength slip's tiny hint: the last logged week of this exercise vs
 * the one before it, e.g. "TOP SET 42.5 KG × 8 · +2.5 KG VS PREV WEEK".
 * Null with no history.
 */
export function progressHint(p: ExerciseProgress, unit: WeightUnit): string | null {
  const last = p.weeks[p.weeks.length - 1];
  if (!last) return null;
  const head = `${KIND_LABELS[p.kind].primary} ${formatPrimary(last, p.kind, unit)}`;
  if (!last.change) return head;
  return `${head} · ${formatPrimaryChange(last.change.primary, p.kind, unit)} VS PREV WEEK`;
}
