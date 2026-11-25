import type { ExerciseTrack } from "@/lib/db/schema";
import type { FreeExerciseRecord } from "@/lib/validation/free-exercise-db";

export const FREE_EXERCISE_DB_SOURCE = "free-exercise-db" as const;

/**
 * Logging-form hint: hold-type exercises (plank, side bridge, isometric
 * squeezes, static stretches) are logged by time; everything else by reps.
 * free-exercise-db marks these with force = "static". Name matching is
 * deliberately not used: "Push Up to Side Plank" is a rep movement.
 */
export function trackingFor(record: Pick<FreeExerciseRecord, "force">): ExerciseTrack {
  return record.force === "static" ? "time" : "reps";
}

/** Row shape written to public.exercises for a library exercise. */
export interface LibraryExerciseRow {
  ownerUserId: null;
  source: typeof FREE_EXERCISE_DB_SOURCE;
  sourceId: string;
  name: string;
  category: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  imagePaths: string[];
  tracking: ExerciseTrack;
}

const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

export function mapFreeExercise(record: FreeExerciseRecord): LibraryExerciseRow {
  return {
    ownerUserId: null,
    source: FREE_EXERCISE_DB_SOURCE,
    sourceId: record.id,
    name: record.name.trim(),
    // Category kept as-is ("strength", "powerlifting", "stretching", …).
    category: record.category ?? null,
    equipment: record.equipment ?? null,
    primaryMuscles: clean(record.primaryMuscles),
    secondaryMuscles: clean(record.secondaryMuscles),
    instructions: record.instructions.map((s) => s.trim()).filter(Boolean),
    // Relative to the upstream `exercises/` folder; served from our own bucket later.
    imagePaths: record.images,
    tracking: trackingFor(record),
  };
}
