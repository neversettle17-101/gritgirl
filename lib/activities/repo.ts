import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityDetail, ExerciseSummary, LastSets } from "@/lib/domain/activity-types";
import { normalizeWeekStart, type WeekStart } from "@/lib/domain/board";
import { todayIn } from "@/lib/domain/dates";
import { DEFAULT_UNITS, type Units } from "@/lib/domain/units";
import type { ActivityInput } from "@/lib/validation/activities";
import type { CustomExerciseInput } from "@/lib/validation/exercises";
import type { DbError } from "@/lib/api/http";
import {
  ACTIVITY_SELECT,
  compareActivitiesDesc,
  mapActivity,
  mapExercise,
  mapLastSets,
  type ActivityRow,
  type ExerciseRow,
} from "./mappers";

/**
 * Data access for activities and exercises. Every call goes through the
 * supabase-js client built from the request cookies, i.e. with the signed-in
 * user's JWT, so RLS applies (§11). Multi-row writes go through the
 * save_activity database function, which runs as one transaction.
 */

type Result<T> = { data: T; error: null } | { data: null; error: DbError };

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = (error: DbError): Result<never> => ({ data: null, error });

export interface UserPrefs {
  units: Units;
  timezone: string;
  /** today's date in the user's time zone */
  today: string;
  /** 0 = Sunday, 1 = Monday … (user_settings.week_starts_on) */
  weekStartsOn: WeekStart;
}

const DEFAULT_TZ = "Asia/Kolkata";

/** Units, time zone and week start from user_settings (a row exists for every user). */
export async function getUserPrefs(supabase: SupabaseClient, now: Date = new Date()): Promise<UserPrefs> {
  const { data } = await supabase
    .from("user_settings")
    .select("weight_unit, distance_unit, timezone, week_starts_on")
    .maybeSingle<{ weight_unit: "kg" | "lb"; distance_unit: "km" | "mi"; timezone: string; week_starts_on: number }>();
  const timezone = data?.timezone || DEFAULT_TZ;
  return {
    units: {
      weight: data?.weight_unit ?? DEFAULT_UNITS.weight,
      distance: data?.distance_unit ?? DEFAULT_UNITS.distance,
    },
    timezone,
    today: todayIn(timezone, now),
    weekStartsOn: normalizeWeekStart(data?.week_starts_on),
  };
}

export async function listActivities(
  supabase: SupabaseClient,
  range: { from: string; to: string },
): Promise<Result<ActivityDetail[]>> {
  const { data, error } = await supabase
    .from("activities")
    .select(ACTIVITY_SELECT)
    .gte("date", range.from)
    .lte("date", range.to)
    .order("date", { ascending: false })
    .returns<ActivityRow[]>();
  if (error) return fail(error);
  return ok((data ?? []).map(mapActivity).sort(compareActivitiesDesc));
}

/** Dates (one per activity, may repeat) with at least one activity in from..to: for streaks. */
export async function listActivityDates(
  supabase: SupabaseClient,
  range: { from: string; to: string },
): Promise<Result<string[]>> {
  const { data, error } = await supabase
    .from("activities")
    .select("date")
    .gte("date", range.from)
    .lte("date", range.to)
    .returns<{ date: string }[]>();
  if (error) return fail(error);
  return ok((data ?? []).map((r) => r.date));
}

export async function getActivity(supabase: SupabaseClient, id: string): Promise<Result<ActivityDetail | null>> {
  const { data, error } = await supabase
    .from("activities")
    .select(ACTIVITY_SELECT)
    .eq("id", id)
    .maybeSingle<ActivityRow>();
  if (error) return fail(error);
  return ok(data ? mapActivity(data) : null);
}

/** Create (replace = false) or replace an activity and all its child rows, in one transaction. */
export async function saveActivity(
  supabase: SupabaseClient,
  doc: ActivityInput,
  replace: boolean,
): Promise<Result<string>> {
  const { data, error } = await supabase.rpc("save_activity", { doc, p_replace: replace });
  if (error) return fail(error);
  return ok(data as string);
}

/** Deletes one activity (cascades to its exercises and sets). False when not found / not yours. */
export async function deleteActivity(supabase: SupabaseClient, id: string): Promise<Result<boolean>> {
  const { data, error } = await supabase.from("activities").delete().eq("id", id).select("id");
  if (error) return fail(error);
  return ok((data ?? []).length > 0);
}

export async function searchExercises(
  supabase: SupabaseClient,
  q: { q?: string; muscle?: string; equipment?: string; limit: number },
): Promise<Result<ExerciseSummary[]>> {
  const { data, error } = await supabase.rpc("search_exercises", {
    q: q.q ?? null,
    muscle: q.muscle ?? null,
    equipment_filter: q.equipment ?? null,
    max_rows: q.limit,
  });
  if (error) return fail(error);
  return ok(((data ?? []) as ExerciseRow[]).map(mapExercise));
}

export async function createCustomExercise(
  supabase: SupabaseClient,
  userId: string,
  input: CustomExerciseInput,
): Promise<Result<ExerciseSummary>> {
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      owner_user_id: userId,
      source: "custom",
      name: input.name,
      tracking: input.tracking,
      equipment: input.equipment,
      primary_muscles: input.primaryMuscles,
    })
    .select("id, name, tracking, owner_user_id, equipment, primary_muscles")
    .single<ExerciseRow>();
  if (error) return fail(error);
  return ok(mapExercise(data));
}

export async function lastSetsFor(supabase: SupabaseClient, exerciseId: string): Promise<Result<LastSets | null>> {
  const { data, error } = await supabase.rpc("exercise_last_sets", { p_exercise_id: exerciseId });
  if (error) return fail(error);
  return ok(mapLastSets(data));
}
