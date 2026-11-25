import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbError } from "@/lib/api/http";
import type { TemplateDetail } from "@/lib/domain/template-types";
import type { TemplateInput } from "@/lib/validation/templates";
import { compareTemplates, mapTemplate, TEMPLATE_SELECT, type TemplateRow, type UsageRow } from "./mappers";

/**
 * Data access for templates ("Regulars"). Like the activities repo, every
 * call uses the signed-in user's client, so RLS applies (§11). Multi-row
 * writes go through the save_template database function (one transaction).
 * Usage counts come from the workout_template_usage view (derived from
 * activities.template_id, never stored).
 */

type Result<T> = { data: T; error: null } | { data: null; error: DbError };

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = (error: DbError): Result<never> => ({ data: null, error });

async function usageFor(supabase: SupabaseClient, ids: string[]): Promise<Result<Map<string, UsageRow>>> {
  if (ids.length === 0) return ok(new Map());
  const { data, error } = await supabase
    .from("workout_template_usage")
    .select("template_id, used_count, last_used_on")
    .in("template_id", ids)
    .returns<UsageRow[]>();
  if (error) return fail(error);
  return ok(new Map((data ?? []).map((u) => [u.template_id, u])));
}

/** My templates, most used first. Archived ones only when asked for. */
export async function listTemplates(
  supabase: SupabaseClient,
  opts: { includeArchived?: boolean } = {},
): Promise<Result<TemplateDetail[]>> {
  let q = supabase.from("workout_templates").select(TEMPLATE_SELECT);
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data, error } = await q.returns<TemplateRow[]>();
  if (error) return fail(error);
  const rows = data ?? [];
  const usage = await usageFor(
    supabase,
    rows.map((r) => r.id),
  );
  if (usage.error) return fail(usage.error);
  return ok(rows.map((r) => mapTemplate(r, usage.data.get(r.id))).sort(compareTemplates));
}

/** One template (archived ones too, so past activities can still name it). */
export async function getTemplate(supabase: SupabaseClient, id: string): Promise<Result<TemplateDetail | null>> {
  const { data, error } = await supabase
    .from("workout_templates")
    .select(TEMPLATE_SELECT)
    .eq("id", id)
    .maybeSingle<TemplateRow>();
  if (error) return fail(error);
  if (!data) return ok(null);
  const usage = await usageFor(supabase, [id]);
  if (usage.error) return fail(usage.error);
  return ok(mapTemplate(data, usage.data.get(id)));
}

/** Create (replace = false) or replace a template and its exercises, in one transaction. */
export async function saveTemplate(
  supabase: SupabaseClient,
  doc: TemplateInput,
  replace: boolean,
): Promise<Result<string>> {
  const { data, error } = await supabase.rpc("save_template", { doc, p_replace: replace });
  if (error) return fail(error);
  return ok(data as string);
}

/**
 * "Deleting" a template archives it: it leaves every list, but activities
 * logged from it keep their template_id and data. False when not found,
 * already archived or not yours.
 */
export async function archiveTemplate(supabase: SupabaseClient, id: string): Promise<Result<boolean>> {
  const { data, error } = await supabase
    .from("workout_templates")
    .update({ archived: true })
    .eq("id", id)
    .eq("archived", false)
    .select("id");
  if (error) return fail(error);
  return ok((data ?? []).length > 0);
}
