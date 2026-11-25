import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FlowLevel } from "@/lib/domain/cycle";
import type { LoggedDay } from "@/lib/domain/cycle-view";
import type { CycleRepo, Settings, SettingsPatch } from "./service";

/**
 * CycleRepo over supabase-js with the signed-in user's JWT, so every query
 * runs under Row-Level Security. user_id filters are belt and braces.
 */

interface SettingsRow {
  display_name: string | null;
  weight_unit: "kg" | "lb";
  distance_unit: "km" | "mi";
  week_starts_on: number;
  timezone: string;
  default_cycle_len: number;
  default_period_len: number;
  cycle_predictions_on: boolean;
  last_period_start: string | null;
  onboarded_at: string | null;
}

const SETTINGS_COLUMNS =
  "display_name, weight_unit, distance_unit, week_starts_on, timezone, default_cycle_len, " +
  "default_period_len, cycle_predictions_on, last_period_start, onboarded_at";

/** Most recent period days the engine reads (years of history; averages only use 6 cycles). */
const MAX_PERIOD_ROWS = 1000;

function toSettings(r: SettingsRow): Settings {
  return {
    displayName: r.display_name,
    weightUnit: r.weight_unit,
    distanceUnit: r.distance_unit,
    weekStartsOn: r.week_starts_on,
    timezone: r.timezone,
    defaultCycleLen: r.default_cycle_len,
    defaultPeriodLen: r.default_period_len,
    cyclePredictionsOn: r.cycle_predictions_on,
    lastPeriodStart: r.last_period_start,
    onboarded: r.onboarded_at !== null,
  };
}

const PATCH_COLUMNS: Record<keyof SettingsPatch, keyof SettingsRow> = {
  displayName: "display_name",
  weightUnit: "weight_unit",
  distanceUnit: "distance_unit",
  weekStartsOn: "week_starts_on",
  timezone: "timezone",
  defaultCycleLen: "default_cycle_len",
  defaultPeriodLen: "default_period_len",
  cyclePredictionsOn: "cycle_predictions_on",
  lastPeriodStart: "last_period_start",
  onboardedAt: "onboarded_at",
};

/** Wraps a Supabase error without leaking request bodies (health data) into logs. */
function dbError(op: string, error: { code?: string; message: string }): Error {
  return new Error(`${op} failed (${error.code ?? "unknown"}): ${error.message}`);
}

export function createSupabaseCycleRepo(supabase: SupabaseClient, userId: string): CycleRepo {
  return {
    async getSettings() {
      const { data, error } = await supabase
        .from("user_settings")
        .select(SETTINGS_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle<SettingsRow>();
      if (error) throw dbError("read settings", error);
      return data ? toSettings(data) : null;
    },

    async updateSettings(patch) {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) row[PATCH_COLUMNS[k as keyof SettingsPatch]] = v;
      }
      const { data, error } = await supabase
        .from("user_settings")
        .update(row)
        .eq("user_id", userId)
        .select(SETTINGS_COLUMNS)
        .maybeSingle<SettingsRow>();
      if (error) throw dbError("update settings", error);
      return data ? toSettings(data) : null;
    },

    async listPeriodDays(range) {
      let q = supabase.from("period_days").select("date, flow").eq("user_id", userId);
      if (range) q = q.gte("date", range.from).lte("date", range.to);
      const { data, error } = await q
        .order("date", { ascending: false })
        .limit(MAX_PERIOD_ROWS)
        .returns<{ date: string; flow: FlowLevel | null }[]>();
      if (error) throw dbError("read period days", error);
      return (data ?? []).reverse();
    },

    async replacePeriodDays(from, to, days) {
      const { error } = await supabase.rpc("replace_period_days", {
        p_from: from,
        p_to: to,
        p_days: days satisfies LoggedDay[],
      });
      if (error) throw dbError("write period days", error);
    },
  };
}
