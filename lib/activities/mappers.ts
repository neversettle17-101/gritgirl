/**
 * Row (snake_case, as PostgREST returns it) → API shape (camelCase).
 * Pure, so it is unit-tested without a database.
 */
import type {
  ActivityDetail,
  ExerciseSummary,
  LastSets,
  SetDetail,
  Tracking,
} from "@/lib/domain/activity-types";
import type { Feel } from "@/lib/validation/activities";

export const ACTIVITY_SELECT = `
  id, type, date, start_time, duration_sec, notes, feel, distance_m, avg_heart_rate,
  template_id, created_at, updated_at,
  activity_exercises (
    id, position, notes,
    exercise:exercises ( id, name, tracking, owner_user_id ),
    exercise_sets ( set_number, reps, duration_sec, weight_kg )
  )
`;

export interface SetRow {
  set_number: number;
  reps: number | null;
  duration_sec: number | null;
  weight_kg: number | string | null;
}

export interface ActivityRow {
  id: string;
  type: ActivityDetail["type"];
  date: string;
  start_time: string | null;
  duration_sec: number | null;
  notes: string | null;
  feel: Feel | null;
  distance_m: number | null;
  avg_heart_rate: number | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
  activity_exercises?: {
    id: string;
    position: number;
    notes: string | null;
    exercise: { id: string; name: string; tracking: Tracking; owner_user_id: string | null } | null;
    exercise_sets: SetRow[] | null;
  }[];
}

export interface ExerciseRow {
  id: string;
  name: string;
  tracking: Tracking;
  owner_user_id: string | null;
  equipment: string | null;
  primary_muscles: string[] | null;
}

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function mapSet(s: SetRow): SetDetail {
  return {
    setNumber: s.set_number,
    reps: s.reps,
    durationSec: s.duration_sec,
    weightKg: num(s.weight_kg),
  };
}

export function mapActivity(r: ActivityRow): ActivityDetail {
  const exercises = (r.activity_exercises ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((ae) => ({
      id: ae.id,
      position: ae.position,
      notes: ae.notes,
      exercise: {
        id: ae.exercise?.id ?? "",
        name: ae.exercise?.name ?? "Unknown exercise",
        tracking: ae.exercise?.tracking ?? "reps",
        custom: Boolean(ae.exercise?.owner_user_id),
      },
      sets: (ae.exercise_sets ?? [])
        .slice()
        .sort((a, b) => a.set_number - b.set_number)
        .map(mapSet),
    }));
  return {
    id: r.id,
    type: r.type,
    date: r.date,
    startTime: r.start_time ? r.start_time.slice(0, 5) : null,
    durationSec: r.duration_sec,
    notes: r.notes,
    feel: r.feel,
    distanceM: r.distance_m,
    avgHeartRate: r.avg_heart_rate,
    templateId: r.template_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    exercises,
  };
}

export function mapExercise(r: ExerciseRow): ExerciseSummary {
  return {
    id: r.id,
    name: r.name,
    tracking: r.tracking,
    custom: r.owner_user_id !== null,
    equipment: r.equipment,
    primaryMuscles: r.primary_muscles ?? [],
  };
}

export function mapLastSets(v: unknown): LastSets | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { activityId: string; date: string; sets: { setNumber: number; reps: number | null; durationSec: number | null; weightKg: number | string | null }[] };
  return {
    activityId: o.activityId,
    date: o.date,
    sets: (o.sets ?? []).map((s) => ({
      setNumber: s.setNumber,
      reps: s.reps,
      durationSec: s.durationSec,
      weightKg: num(s.weightKg),
    })),
  };
}

/** Sorts newest first: date, then start time (unknown last), then creation. */
export function compareActivitiesDesc(a: ActivityDetail, b: ActivityDetail): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const at = a.startTime ?? "";
  const bt = b.startTime ?? "";
  if (at !== bt) return at < bt ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}
