import { z } from "zod";
import { dobProblem, PROFILE_LIMITS } from "@/lib/domain/profile";
import { daysBetween } from "@/lib/domain/dates";
import { fieldErrors, isoDateSchema } from "./activities";

/**
 * PATCH /api/profile — any subset of the profile; null clears an optional
 * field. Canonical units only (cm, kg): the client converts what was typed.
 */
export const profilePatchSchema = z
  .object({
    displayName: z
      .string()
      .max(PROFILE_LIMITS.displayName, `Keep it under ${PROFILE_LIMITS.displayName} characters`)
      .nullable()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    heightCm: z
      .number({ message: "Height must be a number" })
      .min(PROFILE_LIMITS.heightCm.min, `Height should be at least ${PROFILE_LIMITS.heightCm.min} cm`)
      .max(PROFILE_LIMITS.heightCm.max, `Height should be at most ${PROFILE_LIMITS.heightCm.max} cm`)
      .transform((v) => Math.round(v * 10) / 10)
      .nullable(),
    dateOfBirth: isoDateSchema.nullable(),
    weightUnit: z.enum(["kg", "lb"], { message: "Use kg or lb" }),
    distanceUnit: z.enum(["km", "mi"], { message: "Use km or mi" }),
    weekStartsOn: z
      .number()
      .int("Pick a day of the week")
      .min(0, "Pick a day of the week")
      .max(6, "Pick a day of the week"),
  })
  .partial()
  .strict();

export type ProfilePatch = z.infer<typeof profilePatchSchema>;
export type ProfilePatchInput = z.input<typeof profilePatchSchema>;

/** POST /api/body-weight — one weigh-in (kg). measuredOn defaults to today. */
export const bodyWeightInputSchema = z
  .object({
    weightKg: z
      .number({ message: "Weight must be a number" })
      .min(PROFILE_LIMITS.weightKg.min, `Weight should be at least ${PROFILE_LIMITS.weightKg.min} kg`)
      .max(PROFILE_LIMITS.weightKg.max, `Weight should be at most ${PROFILE_LIMITS.weightKg.max} kg`)
      .transform((v) => Math.round(v * 100) / 100),
    measuredOn: isoDateSchema.optional(),
  })
  .strict();

export type BodyWeightInput = z.input<typeof bodyWeightInputSchema>;

type Checked<T> = { ok: true; data: T } | { ok: false; fields: Record<string, string> };

/** Schema plus the checks that need "today" in the user's time zone. */
export function checkProfilePatch(body: unknown, today: string): Checked<ProfilePatch> {
  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const dob = parsed.data.dateOfBirth;
  const problem = dob ? dobProblem(dob, today) : null;
  if (problem) return { ok: false, fields: { dateOfBirth: problem } };
  return { ok: true, data: parsed.data };
}

export function checkBodyWeight(body: unknown, today: string): Checked<{ weightKg: number; measuredOn: string }> {
  const parsed = bodyWeightInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const measuredOn = parsed.data.measuredOn ?? today;
  if (daysBetween(measuredOn, today) < 0) return { ok: false, fields: { measuredOn: "That date hasn't happened yet" } };
  if (measuredOn < PROFILE_LIMITS.dobMin) return { ok: false, fields: { measuredOn: "Use a date after 1900" } };
  return { ok: true, data: { weightKg: parsed.data.weightKg, measuredOn } };
}
