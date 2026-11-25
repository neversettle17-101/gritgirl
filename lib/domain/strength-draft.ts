/**
 * The in-progress strength workout (the "strength slip"), as plain data plus
 * pure update functions. The form keeps one of these in React state and in
 * local storage, so a reload never loses a workout (§6, §12).
 *
 * Inputs are kept as the strings the user typed, in their display units, and
 * converted to the SI API document only on save (draftToPayload).
 */
import type { ActivityDetail, LastSets, SetDetail, Tracking } from "@/lib/domain/activity-types";
import {
  formatClock,
  formatSetTime,
  fromKg,
  parseDecimal,
  parseDuration,
  toKg,
  type WeightUnit,
} from "@/lib/domain/units";
import type { Feel, StrengthActivityInput } from "@/lib/validation/activities";
import { LIMITS } from "@/lib/validation/activities";

export const DRAFT_VERSION = 1;

export interface DraftSet {
  key: string;
  reps: string;
  /** per-set time as typed: "60", "1:30", "90s" (bare numbers = seconds) */
  time: string;
  /** in the draft's weightUnit; blank = bodyweight */
  weight: string;
}

export interface DraftExercise {
  key: string;
  exerciseId: string;
  name: string;
  tracking: Tracking;
  sets: DraftSet[];
}

export interface DraftTimer {
  /** epoch ms when the timer was last started; null while paused */
  startedAt: number | null;
  /** time accumulated before startedAt */
  elapsedMs: number;
}

export interface StrengthDraft {
  version: typeof DRAFT_VERSION;
  /** activity id: client-generated for new workouts, the existing id when editing */
  id: string;
  mode: "new" | "edit";
  date: string;
  startTime: string;
  /** total duration as typed ("43", "43 min", "1:05:00"); bare numbers = minutes */
  duration: string;
  feel: Feel | null;
  notes: string;
  templateId: string | null;
  weightUnit: WeightUnit;
  exercises: DraftExercise[];
  timer: DraftTimer;
}

export interface NewDraftOptions {
  id: string;
  date: string;
  startTime?: string;
  weightUnit: WeightUnit;
}

export function newDraft(o: NewDraftOptions): StrengthDraft {
  return {
    version: DRAFT_VERSION,
    id: o.id,
    mode: "new",
    date: o.date,
    startTime: o.startTime ?? "",
    duration: "",
    feel: null,
    notes: "",
    templateId: null,
    weightUnit: o.weightUnit,
    exercises: [],
    timer: { startedAt: null, elapsedMs: 0 },
  };
}

const emptySet = (key: string): DraftSet => ({ key, reps: "", time: "", weight: "" });

function setFromDetail(s: SetDetail, key: string, unit: WeightUnit): DraftSet {
  return {
    key,
    reps: s.reps === null ? "" : String(s.reps),
    time: s.durationSec === null ? "" : String(s.durationSec),
    weight: s.weightKg === null ? "" : String(fromKg(s.weightKg, unit)),
  };
}

type KeyGen = () => string;

/**
 * Adds an exercise at the end. Pre-fills its sets from the last time you did
 * it when known, otherwise one empty set.
 */
export function addExercise(
  d: StrengthDraft,
  ex: { id: string; name: string; tracking: Tracking },
  key: KeyGen,
  last?: LastSets | null,
): StrengthDraft {
  const sets = last?.sets.length
    ? last.sets.map((s) => setFromDetail(s, key(), d.weightUnit))
    : [emptySet(key())];
  return {
    ...d,
    exercises: [...d.exercises, { key: key(), exerciseId: ex.id, name: ex.name, tracking: ex.tracking, sets }],
  };
}

export function removeExercise(d: StrengthDraft, exKey: string): StrengthDraft {
  return { ...d, exercises: d.exercises.filter((e) => e.key !== exKey) };
}

function move<T>(xs: T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || to < 0 || to >= xs.length) return xs;
  const next = xs.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Moves an exercise up (-1) or down (+1). Out-of-range moves are no-ops. */
export function moveExercise(d: StrengthDraft, exKey: string, delta: -1 | 1): StrengthDraft {
  const i = d.exercises.findIndex((e) => e.key === exKey);
  return { ...d, exercises: move(d.exercises, i, delta) };
}

function updateExercise(d: StrengthDraft, exKey: string, fn: (e: DraftExercise) => DraftExercise): StrengthDraft {
  return { ...d, exercises: d.exercises.map((e) => (e.key === exKey ? fn(e) : e)) };
}

/** New set rows copy the previous set's values, so you change only what differs (§6). */
export function addSet(d: StrengthDraft, exKey: string, key: string): StrengthDraft {
  return updateExercise(d, exKey, (e) => {
    const prev = e.sets[e.sets.length - 1];
    const set = prev ? { ...prev, key } : emptySet(key);
    return { ...e, sets: [...e.sets, set] };
  });
}

export function removeSet(d: StrengthDraft, exKey: string, setKey: string): StrengthDraft {
  return updateExercise(d, exKey, (e) => ({ ...e, sets: e.sets.filter((s) => s.key !== setKey) }));
}

export function moveSet(d: StrengthDraft, exKey: string, setKey: string, delta: -1 | 1): StrengthDraft {
  return updateExercise(d, exKey, (e) => ({
    ...e,
    sets: move(
      e.sets,
      e.sets.findIndex((s) => s.key === setKey),
      delta,
    ),
  }));
}

export function updateSet(
  d: StrengthDraft,
  exKey: string,
  setKey: string,
  patch: Partial<Omit<DraftSet, "key">>,
): StrengthDraft {
  return updateExercise(d, exKey, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.key === setKey ? { ...s, ...patch } : s)),
  }));
}

// ───────── timer ─────────

export function timerElapsedMs(t: DraftTimer, now: number): number {
  return t.elapsedMs + (t.startedAt === null ? 0 : Math.max(0, now - t.startedAt));
}

export function startTimer(d: StrengthDraft, now: number): StrengthDraft {
  if (d.timer.startedAt !== null) return d;
  return { ...d, timer: { ...d.timer, startedAt: now } };
}

/** Pauses the timer and copies its time into the total duration field. */
export function stopTimer(d: StrengthDraft, now: number): StrengthDraft {
  const elapsedMs = timerElapsedMs(d.timer, now);
  const sec = Math.round(elapsedMs / 1000);
  return {
    ...d,
    timer: { startedAt: null, elapsedMs },
    duration: sec > 0 ? formatClock(sec) : d.duration,
  };
}

export function resetTimer(d: StrengthDraft): StrengthDraft {
  return { ...d, timer: { startedAt: null, elapsedMs: 0 } };
}

// ───────── summaries (the compact "3 × 10 reps · 40 kg" line) ─────────

export interface ExerciseLine {
  setCount: number;
  /** "3 × 10 reps", "3 × 60s", "3 sets · 10/8/6 reps" */
  line: string;
  /** "40", "40–45", "BW" in the draft's unit */
  weight: string;
}

function distinct<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function summarizeSets(
  sets: { reps: number | null; durationSec: number | null; weight: number | null }[],
  tracking: Tracking,
): ExerciseLine {
  const n = sets.length;
  if (n === 0) return { setCount: 0, line: "no sets yet", weight: "—" };

  const reps = sets.map((s) => s.reps).filter((v): v is number => v !== null);
  const times = sets.map((s) => s.durationSec).filter((v): v is number => v !== null);
  const preferTime = tracking === "time" ? times.length > 0 : reps.length === 0 && times.length > 0;

  let line: string;
  if (preferTime) {
    const u = distinct(times);
    line = u.length === 1 ? `${n} × ${formatSetTime(u[0]!)}` : `${n} sets · ${times.map(formatSetTime).join("/")}`;
  } else if (reps.length) {
    const u = distinct(reps);
    line = u.length === 1 ? `${n} × ${u[0]} reps` : `${n} sets · ${reps.join("/")} reps`;
  } else {
    line = `${n} ${n === 1 ? "set" : "sets"}`;
  }

  const weights = sets.map((s) => s.weight).filter((v): v is number => v !== null && v > 0);
  let weight = "BW";
  if (weights.length) {
    const lo = Math.min(...weights);
    const hi = Math.max(...weights);
    weight = lo === hi ? String(lo) : `${lo}–${hi}`;
  }
  return { setCount: n, line, weight };
}

export function summarizeDraftExercise(e: DraftExercise): ExerciseLine {
  return summarizeSets(
    e.sets.map((s) => ({
      reps: parseIntOrNull(s.reps),
      durationSec: parseDuration(s.time, "seconds"),
      weight: parseDecimal(s.weight),
    })),
    e.tracking,
  );
}

export function draftTotals(d: StrengthDraft): { items: number; sets: number } {
  return { items: d.exercises.length, sets: d.exercises.reduce((n, e) => n + e.sets.length, 0) };
}

// ───────── draft → API document ─────────

function parseIntOrNull(s: string): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

export type DraftResult =
  | { ok: true; payload: StrengthActivityInput }
  | { ok: false; errors: Record<string, string> };

/**
 * Maps the draft to the POST/PUT document (SI units, positions from order).
 * Reports per-field errors with the same keys the API uses
 * ("exercises.0.sets.1.reps"), so one renderer handles both.
 *
 * Total duration: the typed value, else the stopped/running timer, else
 * null (receipts then fall back to the sum of set times).
 */
export function draftToPayload(d: StrengthDraft, now: number = Date.now()): DraftResult {
  const errors: Record<string, string> = {};

  if (d.exercises.length === 0) errors.exercises = "Add at least one exercise";

  const exercises = d.exercises.map((e, i) => {
    if (e.sets.length === 0) errors[`exercises.${i}.sets`] = "Add at least one set";
    const sets = e.sets.map((s, j) => {
      const at = `exercises.${i}.sets.${j}`;
      let reps: number | null = null;
      let durationSec: number | null = null;
      let weightKg: number | null = null;

      if (s.reps.trim()) {
        reps = parseIntOrNull(s.reps);
        if (reps === null || reps < LIMITS.reps.min || reps > LIMITS.reps.max)
          errors[`${at}.reps`] = `Reps: ${LIMITS.reps.min}–${LIMITS.reps.max}`;
      }
      if (s.time.trim()) {
        durationSec = parseDuration(s.time, "seconds");
        if (durationSec === null || durationSec > LIMITS.setDurationSec.max)
          errors[`${at}.durationSec`] = "Time: up to 60:00";
      }
      if (s.weight.trim()) {
        const w = parseDecimal(s.weight);
        weightKg = w === null ? null : toKg(w, d.weightUnit);
        if (weightKg === null || weightKg > LIMITS.weightKg.max) errors[`${at}.weightKg`] = "Check the weight";
      }
      if (!s.reps.trim() && !s.time.trim()) errors[`${at}.reps`] = "A set needs reps or a time";
      return { reps, durationSec, weightKg };
    });
    return { exerciseId: e.exerciseId, notes: null, sets };
  });

  let durationSec: number | null = null;
  if (d.duration.trim()) {
    durationSec = parseDuration(d.duration, "minutes");
    if (durationSec === null || durationSec > LIMITS.durationSec.max) errors.durationSec = "Duration: like 45 or 1:05:00";
  } else {
    const sec = Math.round(timerElapsedMs(d.timer, now) / 1000);
    durationSec = sec > 0 ? Math.min(sec, LIMITS.durationSec.max) : null;
  }

  if (d.notes.length > LIMITS.notes) errors.notes = `Keep it under ${LIMITS.notes} characters`;

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      id: d.id,
      type: "strength",
      date: d.date,
      startTime: d.startTime || null,
      durationSec,
      notes: d.notes.trim() || null,
      feel: d.feel,
      templateId: d.templateId,
      exercises,
    },
  };
}

// ───────── existing activity → draft (edit) ─────────

export function activityToDraft(a: ActivityDetail, weightUnit: WeightUnit, key: KeyGen): StrengthDraft {
  return {
    version: DRAFT_VERSION,
    id: a.id,
    mode: "edit",
    date: a.date,
    startTime: a.startTime ?? "",
    duration: a.durationSec ? formatClock(a.durationSec) : "",
    feel: a.feel,
    notes: a.notes ?? "",
    templateId: a.templateId,
    weightUnit,
    exercises: a.exercises.map((e) => ({
      key: key(),
      exerciseId: e.exercise.id,
      name: e.exercise.name,
      tracking: e.exercise.tracking,
      sets: e.sets.map((s) => setFromDetail(s, key(), weightUnit)),
    })),
    timer: { startedAt: null, elapsedMs: 0 },
  };
}

// ───────── local storage ─────────

export function draftStorageKey(mode: "new" | "edit", id?: string): string {
  return mode === "new" ? "gritgirl:draft:strength:new" : `gritgirl:draft:strength:${id}`;
}

/** Parses a stored draft; null if missing, corrupt or from an older version. */
export function parseStoredDraft(raw: string | null): StrengthDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<StrengthDraft>;
    if (
      d.version !== DRAFT_VERSION ||
      typeof d.id !== "string" ||
      typeof d.date !== "string" ||
      !Array.isArray(d.exercises) ||
      !d.timer
    )
      return null;
    return d as StrengthDraft;
  } catch {
    return null;
  }
}

/** True when the draft holds anything worth keeping. */
export function draftHasContent(d: StrengthDraft): boolean {
  return d.exercises.length > 0 || d.notes.trim() !== "" || d.duration.trim() !== "" || d.timer.elapsedMs > 0 || d.timer.startedAt !== null;
}
