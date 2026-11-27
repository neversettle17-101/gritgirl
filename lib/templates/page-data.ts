import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lastSetsFor } from "@/lib/activities/repo";
import type { LastSets } from "@/lib/domain/activity-types";
import type { TemplateDetail } from "@/lib/domain/template-types";
import { uuidParam } from "@/lib/validation/activities";
import { buildExerciseProgress, progressHint } from "@/lib/domain/progress";
import type { UserPrefs } from "@/lib/activities/repo";
import { getExerciseHistory } from "@/lib/progress/repo";
import { getTemplate } from "./repo";

/**
 * The regular named by a slip's `?regular=<id>`, if it is mine, not archived
 * and fits the slip (run/walk vs strength). Anything else opens a fresh slip.
 */
export async function regularForSlip(
  supabase: SupabaseClient,
  param: string | string[] | undefined,
  kind: "cardio" | "strength",
): Promise<TemplateDetail | undefined> {
  if (typeof param !== "string" || !uuidParam.safeParse(param).success) return undefined;
  const { data } = await getTemplate(supabase, param);
  if (!data || data.archived) return undefined;
  if ((data.type === "strength") !== (kind === "strength")) return undefined;
  return data;
}

/**
 * The last logged sets of each exercise in a strength regular (the same
 * exercise_last_sets lookup as GET /api/exercises/:id/last), for pre-fill.
 */
export async function lastSetsForTemplate(
  supabase: SupabaseClient,
  t: TemplateDetail,
): Promise<Record<string, LastSets | null>> {
  const ids = [...new Set(t.exercises.map((e) => e.exercise.id))];
  const results = await Promise.all(ids.map((id) => lastSetsFor(supabase, id)));
  return Object.fromEntries(ids.map((id, i) => [id, results[i]!.data ?? null]));
}

/**
 * The slip's tiny "vs last week" line for each exercise of a strength
 * regular ("TOP SET 42.5 KG × 8 · +2.5 KG VS PREV WEEK"). Exercises never
 * logged get no hint.
 */
export async function progressHintsForTemplate(
  supabase: SupabaseClient,
  t: TemplateDetail,
  prefs: Pick<UserPrefs, "units" | "weekStartsOn" | "timezone">,
): Promise<Record<string, string>> {
  const ids = [...new Set(t.exercises.map((e) => e.exercise.id))];
  const results = await Promise.all(ids.map((id) => getExerciseHistory(supabase, id)));
  const hints: Record<string, string> = {};
  ids.forEach((id, i) => {
    const h = results[i]!.data;
    if (!h) return;
    const hint = progressHint(
      buildExerciseProgress(h, { weekStartsOn: prefs.weekStartsOn, timezone: prefs.timezone }),
      prefs.units.weight,
    );
    if (hint) hints[id] = hint;
  });
  return hints;
}
