import { z } from "zod";

/**
 * Filter values for exercise search. These are the distinct values in the
 * vendored free-exercise-db (tests/unit/exercise-catalog.test.ts keeps them
 * in sync with data/vendor/free-exercise-db/exercises.json).
 */
export const MUSCLES = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower back",
  "middle back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
] as const;

export const EQUIPMENT = [
  "bands",
  "barbell",
  "body only",
  "cable",
  "dumbbell",
  "e-z curl bar",
  "exercise ball",
  "foam roll",
  "kettlebells",
  "machine",
  "medicine ball",
  "other",
] as const;

export type Muscle = (typeof MUSCLES)[number];
export type Equipment = (typeof EQUIPMENT)[number];

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

/** GET /api/exercises?q=&muscle=&equipment=&limit= */
export const exerciseSearchSchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  muscle: z.preprocess(emptyToUndefined, z.enum(MUSCLES).optional()),
  equipment: z.preprocess(emptyToUndefined, z.enum(EQUIPMENT).optional()),
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(100).default(30),
  ),
});

/** POST /api/exercises — a custom exercise, visible only to its owner. */
export const customExerciseSchema = z
  .object({
    /** Client-generated (offline-safe); the server makes one if missing. */
    id: z.uuid().optional(),
    name: z
      .string()
      .trim()
      .min(1, "Give it a name")
      .max(200, "Keep the name under 200 characters"),
    tracking: z.enum(["reps", "time"]).default("reps"),
    equipment: z.enum(EQUIPMENT).nullish().transform((v) => v ?? null),
    primaryMuscles: z.array(z.enum(MUSCLES)).max(MUSCLES.length).default([]),
  })
  .strict();

export type CustomExerciseInput = z.infer<typeof customExerciseSchema>;
