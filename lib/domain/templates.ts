/**
 * Templates ("Regulars") as pure logic (technical design §7):
 *
 *   • template → slip: "ring it up" builds a pre-filled run/walk form or
 *     strength draft. Strength sets come from the LAST logged session of each
 *     exercise when there is one, else from the template targets.
 *   • slip → template: "save as a new regular" / "update regular" turn a
 *     validated activity document into a template document.
 *   • change detection for the "Update regular?" offer.
 *   • the Regulars editor form (display units ↔ SI API document).
 *   • the compact card lines on Home and the Regulars screen.
 */
import type { LastSets, SetDetail } from "@/lib/domain/activity-types";
import type { TemplateDetail, TemplateExerciseDetail } from "@/lib/domain/template-types";
import { newCardioForm, type CardioForm } from "@/lib/domain/cardio-form";
import { addExercise, newDraft, type NewDraftOptions, type StrengthDraft } from "@/lib/domain/strength-draft";
import {
  formatClock,
  formatSetTime,
  fromKg,
  fromMetres,
  parseDecimal,
  parseDuration,
  toKg,
  toMetres,
  type DistanceUnit,
  type Units,
  type WeightUnit,
} from "@/lib/domain/units";
import { LIMITS, type CardioActivityInput, type StrengthActivityInput } from "@/lib/validation/activities";
import { TEMPLATE_LIMITS, type TemplatePayload } from "@/lib/validation/templates";

type KeyGen = () => string;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Distance in the user's unit as the slip shows it ("5", "5.2", "3.11"). */
function distanceString(metres: number | null, unit: DistanceUnit): string {
  return metres ? String(round2(fromMetres(metres, unit))) : "";
}

// ───────── template → slip ("ring it up") ─────────

/** A run/walk slip pre-filled from the template's target distance and duration. */
export function templateToCardioForm(
  t: TemplateDetail,
  o: { id: string; date: string; startTime?: string },
  unit: DistanceUnit,
): CardioForm {
  return {
    ...newCardioForm({ id: o.id, type: t.type === "walking" ? "walking" : "running", date: o.date, startTime: o.startTime }),
    distance: distanceString(t.targetDistanceM, unit),
    duration: t.targetDurationSec ? formatClock(t.targetDurationSec) : "",
    templateId: t.id,
  };
}

/** The template's targets as sets: targetSets copies of reps / time / kg. */
export function targetSets(te: TemplateExerciseDetail): SetDetail[] {
  return Array.from({ length: te.targetSets }, (_, i) => ({
    setNumber: i + 1,
    reps: te.targetReps,
    durationSec: te.targetDurationSec,
    weightKg: te.targetWeightKg,
  }));
}

/**
 * A strength slip pre-filled from a template. For each exercise, in order:
 * the sets from the last time you logged it (`lasts[exerciseId]`) if any,
 * otherwise the template targets (§7).
 */
export function templateToStrengthDraft(
  t: TemplateDetail,
  lasts: Readonly<Record<string, LastSets | null | undefined>>,
  o: NewDraftOptions,
  key: KeyGen,
): StrengthDraft {
  let d: StrengthDraft = { ...newDraft(o), templateId: t.id };
  for (const te of t.exercises) {
    const last = lasts[te.exercise.id];
    const source: LastSets = last?.sets.length ? last : { activityId: "", date: "", sets: targetSets(te) };
    d = addExercise(d, te.exercise, key, source);
  }
  return d;
}

// ───────── slip → template ("save as a new regular" / "update regular") ─────────

export interface TemplateMeta {
  id: string;
  name: string;
  notes?: string | null;
}

/**
 * A template document from a validated activity document. Cardio: the
 * distance and duration become the targets. Strength: each exercise keeps
 * its set count, and the first set's reps / time / kg become the targets.
 */
export function activityToTemplatePayload(
  a: CardioActivityInput | StrengthActivityInput,
  meta: TemplateMeta,
): TemplatePayload {
  const base = { id: meta.id, name: meta.name.trim(), notes: meta.notes ?? null };
  if (a.type === "strength") {
    return {
      ...base,
      type: "strength",
      exercises: a.exercises.map((e) => {
        const first = e.sets[0];
        return {
          exerciseId: e.exerciseId,
          targetSets: Math.min(Math.max(e.sets.length, 1), TEMPLATE_LIMITS.targetSets.max),
          targetReps: first?.reps ?? null,
          targetDurationSec: first?.durationSec ?? null,
          targetWeightKg: first?.weightKg ?? null,
        };
      }),
    };
  }
  return { ...base, type: a.type, targetDistanceM: a.distanceM, targetDurationSec: a.durationSec };
}

/** Name check for the "save as a new regular" field. Null when fine. */
export function regularNameError(name: string): string | null {
  const n = name.trim();
  if (!n) return "Give your regular a name";
  if (n.length > TEMPLATE_LIMITS.name) return `Keep the name under ${TEMPLATE_LIMITS.name} characters`;
  return null;
}

// ───────── "Update regular?" ─────────

/** Strength: the exercises (and their order) or a set count differ from the template (§7). */
export function strengthDraftDiffers(d: StrengthDraft, t: TemplateDetail): boolean {
  if (d.exercises.length !== t.exercises.length) return true;
  return d.exercises.some((e, i) => {
    const te = t.exercises[i]!;
    return e.exerciseId !== te.exercise.id || e.sets.length !== te.targetSets;
  });
}

/**
 * Run / walk: the distance (to the metre) or duration (to the second) typed
 * on the slip differs from the template targets, or the type changed.
 */
export function cardioFormDiffers(f: CardioForm, unit: DistanceUnit, t: TemplateDetail): boolean {
  if (f.type !== t.type) return true;
  const d = parseDecimal(f.distance);
  const distanceM = d === null ? null : toMetres(d, unit);
  const durationSec = parseDuration(f.duration, "minutes");
  return distanceM !== t.targetDistanceM || durationSec !== t.targetDurationSec;
}

// ───────── the Regulars editor form ─────────

export interface RegularFormExercise {
  key: string;
  exerciseId: string;
  name: string;
  tracking: "reps" | "time";
  sets: string;
  reps: string;
  /** per-set time; bare numbers = seconds */
  time: string;
  /** in the user's weight unit; blank = bodyweight */
  weight: string;
}

export interface RegularForm {
  id: string;
  type: TemplateDetail["type"];
  name: string;
  notes: string;
  /** run / walk, in the user's distance unit */
  distance: string;
  /** run / walk; bare numbers = minutes */
  duration: string;
  exercises: RegularFormExercise[];
}

export function newRegularForm(id: string, type: TemplateDetail["type"] = "strength"): RegularForm {
  return { id, type, name: "", notes: "", distance: "", duration: "", exercises: [] };
}

export function templateToRegularForm(t: TemplateDetail, units: Units, key: KeyGen): RegularForm {
  return {
    id: t.id,
    type: t.type,
    name: t.name,
    notes: t.notes ?? "",
    distance: distanceString(t.targetDistanceM, units.distance),
    duration: t.targetDurationSec ? formatClock(t.targetDurationSec) : "",
    exercises: t.exercises.map((te) => ({
      key: key(),
      exerciseId: te.exercise.id,
      name: te.exercise.name,
      tracking: te.exercise.tracking,
      sets: String(te.targetSets),
      reps: te.targetReps === null ? "" : String(te.targetReps),
      time: te.targetDurationSec === null ? "" : String(te.targetDurationSec),
      weight: te.targetWeightKg === null ? "" : String(fromKg(te.targetWeightKg, units.weight)),
    })),
  };
}

/** A new exercise row on the editor: 3 sets, nothing else filled in. */
export function newRegularExercise(
  ex: { id: string; name: string; tracking: "reps" | "time" },
  key: string,
): RegularFormExercise {
  return { key, exerciseId: ex.id, name: ex.name, tracking: ex.tracking, sets: "3", reps: "", time: "", weight: "" };
}

export type RegularFormResult =
  | { ok: true; payload: TemplatePayload }
  | { ok: false; errors: Record<string, string> };

const wholeNumber = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

/**
 * Editor form → API document (SI units, positions from order). Error keys
 * match the API's ("exercises.0.targetReps"), so one renderer handles both.
 */
export function regularFormToPayload(f: RegularForm, units: Units): RegularFormResult {
  const errors: Record<string, string> = {};
  const nameError = regularNameError(f.name);
  if (nameError) errors.name = nameError;
  if (f.notes.length > TEMPLATE_LIMITS.notes) errors.notes = `Keep it under ${TEMPLATE_LIMITS.notes} characters`;
  const base = { id: f.id, name: f.name.trim(), notes: f.notes.trim() || null };

  if (f.type !== "strength") {
    let targetDistanceM: number | null = null;
    if (f.distance.trim()) {
      const d = parseDecimal(f.distance);
      targetDistanceM = d === null ? null : toMetres(d, units.distance);
      if (!targetDistanceM || targetDistanceM > LIMITS.distanceM.max)
        errors.targetDistanceM = `Distance: up to ${units.distance === "km" ? "200 km" : "124 mi"}`;
    }
    let targetDurationSec: number | null = null;
    if (f.duration.trim()) {
      targetDurationSec = parseDuration(f.duration, "minutes");
      if (targetDurationSec === null || targetDurationSec > LIMITS.durationSec.max)
        errors.targetDurationSec = "Duration: like 30 or 1:05:00";
    }
    if (Object.keys(errors).length) return { ok: false, errors };
    return { ok: true, payload: { ...base, type: f.type, targetDistanceM, targetDurationSec } };
  }

  if (f.exercises.length === 0) errors.exercises = "Add at least one exercise";
  const exercises = f.exercises.map((e, i) => {
    const at = `exercises.${i}`;
    const sets = wholeNumber(e.sets);
    if (sets === null || sets < TEMPLATE_LIMITS.targetSets.min || sets > TEMPLATE_LIMITS.targetSets.max)
      errors[`${at}.targetSets`] = `Sets: ${TEMPLATE_LIMITS.targetSets.min}–${TEMPLATE_LIMITS.targetSets.max}`;
    let reps: number | null = null;
    if (e.reps.trim()) {
      reps = wholeNumber(e.reps);
      if (reps === null || reps < LIMITS.reps.min || reps > LIMITS.reps.max)
        errors[`${at}.targetReps`] = `Reps: ${LIMITS.reps.min}–${LIMITS.reps.max}`;
    }
    let time: number | null = null;
    if (e.time.trim()) {
      time = parseDuration(e.time, "seconds");
      if (time === null || time > LIMITS.setDurationSec.max) errors[`${at}.targetDurationSec`] = "Time: up to 60:00";
    }
    let weightKg: number | null = null;
    if (e.weight.trim()) {
      const w = parseDecimal(e.weight);
      weightKg = w === null ? null : toKg(w, units.weight);
      if (weightKg === null || weightKg > LIMITS.weightKg.max) errors[`${at}.targetWeightKg`] = "Check the weight";
    }
    return { exerciseId: e.exerciseId, targetSets: sets ?? 1, targetReps: reps, targetDurationSec: time, targetWeightKg: weightKg };
  });
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, payload: { ...base, type: "strength", exercises } };
}

// ───────── card lines ─────────

/** "~30 MIN" — rounded to the minute. */
export function approxMinutes(sec: number): string {
  return `~${Math.max(1, Math.round(sec / 60))} MIN`;
}

/** "3×10 · 40 KG", "3×60s · BW", "3 SETS · 20 KG" */
export function targetLine(te: TemplateExerciseDetail, unit: WeightUnit): string {
  const n = te.targetSets;
  const what =
    te.exercise.tracking === "time" && te.targetDurationSec
      ? `${n}×${formatSetTime(te.targetDurationSec)}`
      : te.targetReps
        ? `${n}×${te.targetReps}`
        : te.targetDurationSec
          ? `${n}×${formatSetTime(te.targetDurationSec)}`
          : `${n} ${n === 1 ? "SET" : "SETS"}`;
  const weight = te.targetWeightKg ? `${fromKg(te.targetWeightKg, unit)} ${unit.toUpperCase()}` : "BW";
  return `${what} · ${weight}`;
}

/** The itemised lines on a Regulars card. */
export function templateLines(t: TemplateDetail, units: Units): { label: string; value: string }[] {
  if (t.type === "strength") {
    return t.exercises.map((te) => ({ label: te.exercise.name.toUpperCase(), value: targetLine(te, units.weight) }));
  }
  const lines: { label: string; value: string }[] = [];
  if (t.targetDistanceM)
    lines.push({
      label: "DISTANCE",
      value: `${fromMetres(t.targetDistanceM, units.distance).toFixed(1)} ${units.distance.toUpperCase()}`,
    });
  if (t.targetDurationSec) lines.push({ label: "TARGET", value: approxMinutes(t.targetDurationSec) });
  if (!lines.length) lines.push({ label: "TARGET", value: "OPEN ORDER" });
  return lines;
}

/** One line for the Home "THE USUAL?" cards: "5.0 KM · ~30 MIN", "3 ITEMS · 9 SETS". */
export function templateTagline(t: TemplateDetail, units: Units): string {
  if (t.type === "strength") {
    const sets = t.exercises.reduce((n, e) => n + e.targetSets, 0);
    const items = t.exercises.length;
    return `${items} ${items === 1 ? "ITEM" : "ITEMS"} · ${sets} ${sets === 1 ? "SET" : "SETS"}`;
  }
  const parts: string[] = [];
  if (t.targetDistanceM)
    parts.push(`${fromMetres(t.targetDistanceM, units.distance).toFixed(1)} ${units.distance.toUpperCase()}`);
  if (t.targetDurationSec) parts.push(approxMinutes(t.targetDurationSec));
  return parts.join(" · ") || "OPEN ORDER";
}

/** The slip route that rings this template up. */
export function ringUpHref(t: Pick<TemplateDetail, "id" | "type">): string {
  const slug = t.type === "running" ? "run" : t.type === "walking" ? "walk" : "strength";
  return `/log/${slug}?regular=${t.id}`;
}
