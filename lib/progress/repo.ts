import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbError } from "@/lib/api/http";
import type { Tracking } from "@/lib/domain/activity-types";
import type { ExerciseHistory, ProgressSession } from "@/lib/domain/progress";

/**
 * Per-exercise strength history for the progress pages, through the
 * exercise_progress database function (security invoker: my rows only).
 */

type Result<T> = { data: T; error: null } | { data: null; error: DbError };

export interface ProgressRow {
  exercise_id: string;
  name: string;
  tracking: Tracking;
  sessions: {
    activityId: string;
    date: string;
    sets: { reps: number | null; durationSec: number | null; weightKg: number | string | null }[];
  }[];
}

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export function mapProgressRow(r: ProgressRow): ExerciseHistory {
  return {
    exerciseId: r.exercise_id,
    name: r.name,
    tracking: r.tracking,
    sessions: (r.sessions ?? []).map(
      (s): ProgressSession => ({
        activityId: s.activityId,
        date: s.date,
        sets: (s.sets ?? []).map((x) => ({ reps: num(x.reps), durationSec: num(x.durationSec), weightKg: num(x.weightKg) })),
      }),
    ),
  };
}

/** Every exercise I have logged, most recently done first. */
export async function listExerciseHistories(supabase: SupabaseClient): Promise<Result<ExerciseHistory[]>> {
  const { data, error } = await supabase.rpc("exercise_progress", { p_exercise_id: null });
  if (error) return { data: null, error };
  return { data: ((data ?? []) as ProgressRow[]).map(mapProgressRow), error: null };
}

/** One exercise's history; null when I have never logged it. */
export async function getExerciseHistory(
  supabase: SupabaseClient,
  exerciseId: string,
): Promise<Result<ExerciseHistory | null>> {
  const { data, error } = await supabase.rpc("exercise_progress", { p_exercise_id: exerciseId });
  if (error) return { data: null, error };
  const row = ((data ?? []) as ProgressRow[])[0];
  return { data: row ? mapProgressRow(row) : null, error: null };
}

/** The exercise's name, for the "not logged yet" page (library or my custom one, via RLS). */
export async function getExerciseName(supabase: SupabaseClient, exerciseId: string): Promise<string | null> {
  const { data } = await supabase.from("exercises").select("name").eq("id", exerciseId).maybeSingle<{ name: string }>();
  return data?.name ?? null;
}
