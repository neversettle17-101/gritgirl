import { z } from "zod";
import { addDays, daysBetween, isIsoDate } from "@/lib/domain/dates";

/**
 * Activity documents for POST /api/activities and PUT /api/activities/:id
 * (technical design §6 and the §10 validation rules). The same schema checks
 * the API input and the forms' payload.
 */

export const FEEL_LEVELS = ["breezy", "easy", "solid", "spicy", "wrecked"] as const;
export type Feel = (typeof FEEL_LEVELS)[number];

export const CARDIO_TYPES = ["running", "walking"] as const;
export const ACTIVITY_TYPES = ["running", "walking", "strength"] as const;

export const LIMITS = {
  durationSec: { min: 1, max: 86_400 },
  distanceM: { min: 1, max: 200_000 },
  avgHeartRate: { min: 30, max: 230 },
  notes: 2000,
  reps: { min: 1, max: 500 },
  setDurationSec: { min: 1, max: 3600 },
  weightKg: { min: 0, max: 1000 },
  exercises: 50,
  setsPerExercise: 50,
  /** The date cannot be more than 1 day in the future. */
  futureDays: 1,
} as const;

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: "Use a date like 2026-11-24" });

const optionalText = z
  .string()
  .max(LIMITS.notes, `Keep it under ${LIMITS.notes} characters`)
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const int = (min: number, max: number, label: string) =>
  z
    .number({ message: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

/**
 * Weight in kg. Stored as numeric(6,2), so at most 2 decimals. (§10 says
 * 0.25 kg steps, but a lb entry converts to e.g. 45 lb → 20.41 kg, so the
 * API accepts any 0.01 kg step.)
 */
const weightKg = z
  .number({ message: "Weight must be a number" })
  .min(LIMITS.weightKg.min, "Weight cannot be negative")
  .max(LIMITS.weightKg.max, `Weight must be at most ${LIMITS.weightKg.max} kg`)
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Weight allows 2 decimals")
  .nullish()
  .transform((v) => v ?? null);

export const setSchema = z
  .object({
    /** Ignored: array order is the set number. Accepted for the §6 document shape. */
    setNumber: z.number().int().positive().optional(),
    reps: int(LIMITS.reps.min, LIMITS.reps.max, "Reps").nullish().transform((v) => v ?? null),
    durationSec: int(LIMITS.setDurationSec.min, LIMITS.setDurationSec.max, "Set time")
      .nullish()
      .transform((v) => v ?? null),
    weightKg,
  })
  .strict()
  .refine((s) => s.reps !== null || s.durationSec !== null, {
    message: "A set needs reps or a time",
    path: ["reps"],
  });

export const activityExerciseSchema = z
  .object({
    exerciseId: z.uuid("Pick an exercise"),
    /** Ignored: array order is the position. */
    position: z.number().int().positive().optional(),
    notes: optionalText,
    sets: z
      .array(setSchema)
      .min(1, "Add at least one set")
      .max(LIMITS.setsPerExercise, `At most ${LIMITS.setsPerExercise} sets`),
  })
  .strict();

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use a time like 07:15")
  .nullish()
  .transform((v) => (v ? v.slice(0, 5) : null));

const base = {
  id: z.uuid("id must be a UUID"),
  date: isoDateSchema,
  startTime: timeOfDay,
  notes: optionalText,
  feel: z.enum(FEEL_LEVELS).nullish().transform((v) => v ?? null),
  templateId: z.uuid().nullish().transform((v) => v ?? null),
};

export const cardioActivitySchema = z
  .object({
    ...base,
    type: z.enum(CARDIO_TYPES),
    durationSec: int(LIMITS.durationSec.min, LIMITS.durationSec.max, "Duration"),
    distanceM: int(LIMITS.distanceM.min, LIMITS.distanceM.max, "Distance")
      .nullish()
      .transform((v) => v ?? null),
    avgHeartRate: int(LIMITS.avgHeartRate.min, LIMITS.avgHeartRate.max, "Heart rate")
      .nullish()
      .transform((v) => v ?? null),
  })
  .strict();

export const strengthActivitySchema = z
  .object({
    ...base,
    type: z.literal("strength"),
    /** Optional: falls back to the sum of set times on display (§6). */
    durationSec: int(LIMITS.durationSec.min, LIMITS.durationSec.max, "Duration")
      .nullish()
      .transform((v) => v ?? null),
    exercises: z
      .array(activityExerciseSchema)
      .min(1, "Add at least one exercise")
      .max(LIMITS.exercises, `At most ${LIMITS.exercises} exercises`),
  })
  .strict();

/**
 * Builds the activity schema for a given "today" (the user's local date), so
 * the "not more than 1 day in the future" rule follows the user's time zone.
 */
export function activityInputSchema(today: string) {
  const latest = addDays(today, LIMITS.futureDays);
  return z
    .discriminatedUnion("type", [cardioActivitySchema, strengthActivitySchema])
    .refine((a) => daysBetween(latest, a.date) <= 0, {
      message: "That date is too far in the future",
      path: ["date"],
    });
}

export type ActivityInput = z.infer<ReturnType<typeof activityInputSchema>>;
export type CardioActivityInput = z.infer<typeof cardioActivitySchema>;
export type StrengthActivityInput = z.infer<typeof strengthActivitySchema>;
/** What callers send (before transforms fill nulls). */
export type ActivityPayload = z.input<ReturnType<typeof activityInputSchema>>;

/** GET /api/activities?from=&to= — at most ~a year per request. */
export const MAX_RANGE_DAYS = 400;

export const activityRangeSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((r) => daysBetween(r.from, r.to) >= 0, { message: "`to` must not be before `from`", path: ["to"] })
  .refine((r) => daysBetween(r.from, r.to) <= MAX_RANGE_DAYS, {
    message: `Ask for at most ${MAX_RANGE_DAYS} days at a time`,
    path: ["to"],
  });

export const uuidParam = z.uuid();

/** Flattens Zod issues into { "exercises.0.sets.1.reps": "…" } for the API error body. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}
