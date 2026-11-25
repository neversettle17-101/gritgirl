import { z } from "zod";
import { CARDIO_TYPES, LIMITS } from "@/lib/validation/activities";

/**
 * Template ("Regular") documents for POST /api/templates and
 * PUT /api/templates/:id (technical design §7, §10). Units are SI. The same
 * schema checks the API input and the forms' payload.
 */

export const TEMPLATE_LIMITS = {
  name: 80,
  notes: LIMITS.notes,
  exercises: LIMITS.exercises,
  targetSets: { min: 1, max: LIMITS.setsPerExercise },
} as const;

const int = (min: number, max: number, label: string) =>
  z
    .number({ message: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

const optionalInt = (min: number, max: number, label: string) =>
  int(min, max, label)
    .nullish()
    .transform((v) => v ?? null);

const name = z
  .string({ message: "Give it a name" })
  .transform((v) => v.trim())
  .pipe(
    z
      .string()
      .min(1, "Give it a name")
      .max(TEMPLATE_LIMITS.name, `Keep the name under ${TEMPLATE_LIMITS.name} characters`),
  );

const notes = z
  .string()
  .max(TEMPLATE_LIMITS.notes, `Keep it under ${TEMPLATE_LIMITS.notes} characters`)
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const weightKg = z
  .number({ message: "Weight must be a number" })
  .min(LIMITS.weightKg.min, "Weight cannot be negative")
  .max(LIMITS.weightKg.max, `Weight must be at most ${LIMITS.weightKg.max} kg`)
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Weight allows 2 decimals")
  .nullish()
  .transform((v) => v ?? null);

export const templateExerciseSchema = z
  .object({
    exerciseId: z.uuid("Pick an exercise"),
    /** Ignored: array order is the position. */
    position: z.number().int().positive().optional(),
    targetSets: int(TEMPLATE_LIMITS.targetSets.min, TEMPLATE_LIMITS.targetSets.max, "Sets"),
    targetReps: optionalInt(LIMITS.reps.min, LIMITS.reps.max, "Reps"),
    targetDurationSec: optionalInt(LIMITS.setDurationSec.min, LIMITS.setDurationSec.max, "Set time"),
    targetWeightKg: weightKg,
  })
  .strict();

const base = {
  id: z.uuid("id must be a UUID"),
  name,
  notes,
};

export const cardioTemplateSchema = z
  .object({
    ...base,
    type: z.enum(CARDIO_TYPES),
    targetDistanceM: optionalInt(LIMITS.distanceM.min, LIMITS.distanceM.max, "Distance"),
    targetDurationSec: optionalInt(LIMITS.durationSec.min, LIMITS.durationSec.max, "Duration"),
  })
  .strict();

export const strengthTemplateSchema = z
  .object({
    ...base,
    type: z.literal("strength"),
    exercises: z
      .array(templateExerciseSchema)
      .min(1, "Add at least one exercise")
      .max(TEMPLATE_LIMITS.exercises, `At most ${TEMPLATE_LIMITS.exercises} exercises`),
  })
  .strict();

export const templateInputSchema = z.discriminatedUnion("type", [cardioTemplateSchema, strengthTemplateSchema]);

export type TemplateInput = z.infer<typeof templateInputSchema>;
export type CardioTemplateInput = z.infer<typeof cardioTemplateSchema>;
export type StrengthTemplateInput = z.infer<typeof strengthTemplateSchema>;
/** What callers send (before transforms fill nulls). */
export type TemplatePayload = z.input<typeof templateInputSchema>;
