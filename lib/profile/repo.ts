import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbError } from "@/lib/api/http";
import { normalizeWeekStart } from "@/lib/domain/board";
import type { BodyWeightEntry, Profile } from "@/lib/domain/profile";
import type { ProfilePatch } from "@/lib/validation/profile";

type Result<T> = { data: T; error: null } | { data: null; error: DbError };

/** How many weigh-ins the profile shows. */
export const RECENT_WEIGHTS = 8;

export const PROFILE_SELECT = "display_name, height_cm, date_of_birth, weight_unit, distance_unit, week_starts_on";

export interface ProfileRow {
  display_name: string | null;
  height_cm: number | string | null;
  date_of_birth: string | null;
  weight_unit: "kg" | "lb";
  distance_unit: "km" | "mi";
  week_starts_on: number;
}

export interface BodyWeightRow {
  id: string;
  measured_on: string;
  weight_kg: number | string;
}

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function mapProfile(r: ProfileRow): Profile {
  return {
    displayName: r.display_name,
    heightCm: num(r.height_cm),
    dateOfBirth: r.date_of_birth,
    weightUnit: r.weight_unit,
    distanceUnit: r.distance_unit,
    weekStartsOn: normalizeWeekStart(r.week_starts_on),
  };
}

export const mapBodyWeight = (r: BodyWeightRow): BodyWeightEntry => ({
  id: r.id,
  measuredOn: r.measured_on,
  weightKg: Number(r.weight_kg),
});

/** API field → column, for PATCH. */
const COLUMN: Record<keyof ProfilePatch, keyof ProfileRow> = {
  displayName: "display_name",
  heightCm: "height_cm",
  dateOfBirth: "date_of_birth",
  weightUnit: "weight_unit",
  distanceUnit: "distance_unit",
  weekStartsOn: "week_starts_on",
};

export function patchToRow(patch: ProfilePatch): Partial<ProfileRow> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) row[COLUMN[k as keyof ProfilePatch]] = v;
  return row as Partial<ProfileRow>;
}

/** The settings row exists for every user (created by the auth trigger). */
export async function getProfile(supabase: SupabaseClient): Promise<Result<Profile>> {
  const { data, error } = await supabase.from("user_settings").select(PROFILE_SELECT).maybeSingle<ProfileRow>();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: { code: "P0002" } };
  return { data: mapProfile(data), error: null };
}

export async function updateProfile(supabase: SupabaseClient, userId: string, patch: ProfilePatch): Promise<Result<Profile>> {
  const row = patchToRow(patch);
  if (Object.keys(row).length === 0) return getProfile(supabase);
  const { data, error } = await supabase
    .from("user_settings")
    .update(row)
    .eq("user_id", userId)
    .select(PROFILE_SELECT)
    .maybeSingle<ProfileRow>();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: { code: "P0002" } };
  return { data: mapProfile(data), error: null };
}

/** Most recent first. */
export async function listBodyWeights(supabase: SupabaseClient, limit = RECENT_WEIGHTS): Promise<Result<BodyWeightEntry[]>> {
  const { data, error } = await supabase
    .from("body_weight_entries")
    .select("id, measured_on, weight_kg")
    .order("measured_on", { ascending: false })
    .limit(limit)
    .returns<BodyWeightRow[]>();
  if (error) return { data: null, error };
  return { data: (data ?? []).map(mapBodyWeight), error: null };
}

/** One weigh-in per day: logging again on the same date replaces it. */
export async function upsertBodyWeight(
  supabase: SupabaseClient,
  userId: string,
  input: { measuredOn: string; weightKg: number },
): Promise<Result<BodyWeightEntry>> {
  const { data, error } = await supabase
    .from("body_weight_entries")
    .upsert(
      { user_id: userId, measured_on: input.measuredOn, weight_kg: input.weightKg },
      { onConflict: "user_id,measured_on" },
    )
    .select("id, measured_on, weight_kg")
    .single<BodyWeightRow>();
  if (error) return { data: null, error };
  return { data: mapBodyWeight(data), error: null };
}

/** Deletes one of my weigh-ins; false when there was none with that id. */
export async function deleteBodyWeight(supabase: SupabaseClient, id: string): Promise<Result<boolean>> {
  const { data, error } = await supabase.from("body_weight_entries").delete().eq("id", id).select("id");
  if (error) return { data: null, error };
  return { data: (data ?? []).length > 0, error: null };
}
