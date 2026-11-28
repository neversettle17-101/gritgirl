import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbError } from "@/lib/api/http";
import type { CycleMarkPrefsPatch } from "@/lib/validation/cycle";
import type { CycleMarkPrefs } from "./repo";

/**
 * Writes for the cycle desk, through the user's RLS-scoped client. Reads live
 * in ./repo (listPeriodDates, getCycleMarkPrefs). Never log the rows: cycle
 * data is sensitive (§11).
 */

type Result<T> = { data: T; error: null } | { data: null; error: DbError };

/**
 * Marks these days. Idempotent: a day that's already logged is left as it is
 * (its flow, if any, is kept).
 */
export async function addPeriodDates(
  supabase: SupabaseClient,
  userId: string,
  dates: readonly string[],
): Promise<Result<string[]>> {
  const { error } = await supabase
    .from("period_days")
    .upsert(
      dates.map((date) => ({ user_id: userId, date })),
      { onConflict: "user_id,date", ignoreDuplicates: true },
    );
  if (error) return { data: null, error };
  return { data: [...dates], error: null };
}

/** Unmarks one day. Idempotent: removing a day that isn't logged is fine. */
export async function removePeriodDate(supabase: SupabaseClient, userId: string, date: string): Promise<Result<null>> {
  const { error } = await supabase.from("period_days").delete().eq("user_id", userId).eq("date", date);
  if (error) return { data: null, error };
  return { data: null, error: null };
}

const COLUMN: Record<keyof CycleMarkPrefs, string> = {
  circleLedgers: "cycle_circle_ledgers",
  circleProgress: "cycle_circle_progress",
};

type PrefsRow = { cycle_circle_ledgers: boolean; cycle_circle_progress: boolean };

/** Changes either switch; returns both. */
export async function updateCycleMarkPrefs(
  supabase: SupabaseClient,
  userId: string,
  patch: CycleMarkPrefsPatch,
): Promise<Result<CycleMarkPrefs>> {
  const row: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) row[COLUMN[k as keyof CycleMarkPrefs]] = v;
  const query =
    Object.keys(row).length === 0
      ? supabase.from("user_settings").select("cycle_circle_ledgers, cycle_circle_progress")
      : supabase.from("user_settings").update(row).eq("user_id", userId).select("cycle_circle_ledgers, cycle_circle_progress");
  const { data, error } = await query.maybeSingle<PrefsRow>();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: { code: "P0002" } };
  return { data: { circleLedgers: data.cycle_circle_ledgers, circleProgress: data.cycle_circle_progress }, error: null };
}
