/**
 * Template ("Regular") shapes returned by the API (GET /api/templates[/:id]).
 * camelCase, SI units. Usage is derived from activities.template_id.
 */
import type { ActivityType, ExerciseSummary } from "@/lib/domain/activity-types";

export interface TemplateExerciseDetail {
  id: string;
  position: number;
  exercise: Pick<ExerciseSummary, "id" | "name" | "tracking" | "custom">;
  targetSets: number;
  targetReps: number | null;
  targetDurationSec: number | null;
  /** null = bodyweight / not set */
  targetWeightKg: number | null;
}

export interface TemplateDetail {
  id: string;
  type: ActivityType;
  name: string;
  notes: string | null;
  /** running / walking only */
  targetDistanceM: number | null;
  targetDurationSec: number | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** how many activities were logged from this template ("used 12×") */
  usedCount: number;
  /** date of the most recent of them, or null */
  lastUsedOn: string | null;
  /** strength only, in order */
  exercises: TemplateExerciseDetail[];
}
