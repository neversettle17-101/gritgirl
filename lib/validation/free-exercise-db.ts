import { z } from "zod";

/**
 * One record of data/vendor/free-exercise-db/exercises.json (upstream
 * schema.json). Unknown keys are ignored; bad rows are skipped and logged
 * by the seed script rather than aborting the import.
 */
export const freeExerciseRecordSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  force: z.enum(["pull", "push", "static"]).nullable().optional(),
  level: z.enum(["beginner", "intermediate", "expert"]).nullable().optional(),
  mechanic: z.enum(["compound", "isolation"]).nullable().optional(),
  equipment: z.string().trim().min(1).nullable().optional(),
  primaryMuscles: z.array(z.string().trim().min(1)).default([]),
  secondaryMuscles: z.array(z.string().trim().min(1)).default([]),
  instructions: z.array(z.string()).default([]),
  category: z.string().trim().min(1).nullable().optional(),
  images: z
    .array(
      z
        .string()
        .min(1)
        // Relative paths only; we serve images ourselves, never hot-link.
        .refine((p) => !p.includes("..") && !p.startsWith("/") && !/^[a-z]+:/i.test(p), {
          message: "image path must be relative",
        }),
    )
    .default([]),
});

export type FreeExerciseRecord = z.infer<typeof freeExerciseRecordSchema>;
