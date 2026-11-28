import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbError } from "@/lib/api/http";
import { periodMarksIn, periodReadWindow, type PeriodMark } from "@/lib/domain/period-marks";

/**
 * Logged period days and the cycle desk switches, through the user's
 * RLS-scoped client (period_days and user_settings are owner-only).
 * Never log the rows: cycle data is sensitive (§11).
 */

type Result<T> = { data: T; error: null } | { data: null; error: DbError };

export interface CycleMarkPrefs {
  /** Circle period days on the Week / Month ledgers. */
  circleLedgers: boolean;
  /** Circle period days on the per-exercise progress charts. */
  circleProgress: boolean;
}

export const DEFAULT_CYCLE_MARK_PREFS: CycleMarkPrefs = { circleLedgers: true, circleProgress: true };

/** Logged period dates in [from, to] (inclusive), ascending. */
export async function listPeriodDates(
  supabase: SupabaseClient,
  range: { from: string; to: string },
): Promise<Result<string[]>> {
  const { data, error } = await supabase
    .from("period_days")
    .select("date")
    .gte("date", range.from)
    .lte("date", range.to)
    .order("date", { ascending: true });
  if (error) return { data: null, error };
  return { data: ((data ?? []) as { date: string }[]).map((r) => r.date), error: null };
}

/** The cycle desk switches; defaults when the settings row doesn't exist yet. */
export async function getCycleMarkPrefs(supabase: SupabaseClient): Promise<Result<CycleMarkPrefs>> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("cycle_circle_ledgers, cycle_circle_progress")
    .maybeSingle();
  if (error) return { data: null, error };
  if (!data) return { data: DEFAULT_CYCLE_MARK_PREFS, error: null };
  const row = data as { cycle_circle_ledgers: boolean; cycle_circle_progress: boolean };
  return { data: { circleLedgers: row.cycle_circle_ledgers, circleProgress: row.cycle_circle_progress }, error: null };
}

/**
 * The period days to circle on one surface within [from, to], numbered
 * (DAY 1, DAY 2 …). Empty when that surface's switch is off.
 */
export async function loadPeriodMarks(
  supabase: SupabaseClient,
  range: { from: string; to: string },
  surface: "ledgers" | "progress",
): Promise<Result<PeriodMark[]>> {
  const [prefs, dates] = await Promise.all([getCycleMarkPrefs(supabase), listPeriodDates(supabase, periodReadWindow(range))]);
  if (prefs.error) return { data: null, error: prefs.error };
  if (dates.error) return { data: null, error: dates.error };
  const on = surface === "ledgers" ? prefs.data.circleLedgers : prefs.data.circleProgress;
  return { data: on ? periodMarksIn(dates.data, range) : [], error: null };
}
