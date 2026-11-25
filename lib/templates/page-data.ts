import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lastSetsFor } from "@/lib/activities/repo";
import type { LastSets } from "@/lib/domain/activity-types";
import type { TemplateDetail } from "@/lib/domain/template-types";
import { uuidParam } from "@/lib/validation/activities";
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
