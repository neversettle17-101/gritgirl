/**
 * Template rows (snake_case, as PostgREST returns them) → API shape.
 * Pure, so it is unit-tested without a database.
 */
import type { ActivityType, Tracking } from "@/lib/domain/activity-types";
import type { TemplateDetail } from "@/lib/domain/template-types";

export const TEMPLATE_SELECT = `
  id, type, name, notes, target_distance_m, target_duration_sec, archived, created_at, updated_at,
  template_exercises (
    id, position, target_sets, target_reps, target_duration_sec, target_weight_kg,
    exercise:exercises ( id, name, tracking, owner_user_id )
  )
`;

export interface TemplateRow {
  id: string;
  type: ActivityType;
  name: string;
  notes: string | null;
  target_distance_m: number | null;
  target_duration_sec: number | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  template_exercises?: {
    id: string;
    position: number;
    target_sets: number;
    target_reps: number | null;
    target_duration_sec: number | null;
    target_weight_kg: number | string | null;
    exercise: { id: string; name: string; tracking: Tracking; owner_user_id: string | null } | null;
  }[];
}

export interface UsageRow {
  template_id: string;
  used_count: number;
  last_used_on: string | null;
}

export function mapTemplate(r: TemplateRow, usage?: UsageRow | null): TemplateDetail {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    notes: r.notes,
    targetDistanceM: r.target_distance_m,
    targetDurationSec: r.target_duration_sec,
    archived: r.archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    usedCount: usage?.used_count ?? 0,
    lastUsedOn: usage?.last_used_on ?? null,
    exercises: (r.template_exercises ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((te) => ({
        id: te.id,
        position: te.position,
        exercise: {
          id: te.exercise?.id ?? "",
          name: te.exercise?.name ?? "Unknown exercise",
          tracking: te.exercise?.tracking ?? "reps",
          custom: Boolean(te.exercise?.owner_user_id),
        },
        targetSets: te.target_sets,
        targetReps: te.target_reps,
        targetDurationSec: te.target_duration_sec,
        targetWeightKg: te.target_weight_kg === null ? null : Number(te.target_weight_kg),
      })),
  };
}

/**
 * Most-used first, then most recently used, then newest. The home screen's
 * "THE USUAL?" and the Regulars list both use this order.
 */
export function compareTemplates(a: TemplateDetail, b: TemplateDetail): number {
  if (a.usedCount !== b.usedCount) return b.usedCount - a.usedCount;
  const al = a.lastUsedOn ?? "";
  const bl = b.lastUsedOn ?? "";
  if (al !== bl) return al < bl ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}
