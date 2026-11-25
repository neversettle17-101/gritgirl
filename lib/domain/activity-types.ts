/**
 * Activity shapes returned by the API (GET /api/activities[/:id]). camelCase,
 * SI units. Shared by route handlers, server components and client forms.
 */
import type { Feel } from "@/lib/validation/activities";

export type ActivityType = "running" | "walking" | "strength";
export type Tracking = "reps" | "time";

export interface SetDetail {
  setNumber: number;
  reps: number | null;
  durationSec: number | null;
  /** null = bodyweight */
  weightKg: number | null;
}

export interface ExerciseSummary {
  id: string;
  name: string;
  tracking: Tracking;
  /** true for the user's own custom exercises */
  custom: boolean;
  equipment: string | null;
  primaryMuscles: string[];
}

export interface ActivityExerciseDetail {
  id: string;
  position: number;
  notes: string | null;
  exercise: Pick<ExerciseSummary, "id" | "name" | "tracking" | "custom">;
  sets: SetDetail[];
}

export interface ActivityDetail {
  id: string;
  type: ActivityType;
  date: string;
  /** "HH:MM" local time, or null */
  startTime: string | null;
  durationSec: number | null;
  notes: string | null;
  feel: Feel | null;
  distanceM: number | null;
  avgHeartRate: number | null;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Strength only; [] for runs and walks. */
  exercises: ActivityExerciseDetail[];
}

export interface LastSets {
  activityId: string;
  date: string;
  sets: SetDetail[];
}

export const TYPE_LABEL: Record<ActivityType, string> = {
  running: "RUN",
  walking: "WALK",
  strength: "STRENGTH",
};

/** URL slug used by the log routes: /log/run, /log/walk, /log/strength. */
export const TYPE_SLUG: Record<ActivityType, "run" | "walk" | "strength"> = {
  running: "run",
  walking: "walk",
  strength: "strength",
};

/**
 * Total time of an activity for receipts: the recorded duration, else (for
 * strength) the sum of the set times. Null when neither is known; shown as
 * "—", never guessed (§6).
 */
export function effectiveDurationSec(a: Pick<ActivityDetail, "durationSec" | "exercises">): number | null {
  if (a.durationSec) return a.durationSec;
  const sum = a.exercises.reduce(
    (acc, ex) => acc + ex.sets.reduce((s, set) => s + (set.durationSec ?? 0), 0),
    0,
  );
  return sum > 0 ? sum : null;
}
