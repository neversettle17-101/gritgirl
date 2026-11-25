import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listActivities, listActivityDates, type UserPrefs } from "@/lib/activities/repo";
import type { DbError } from "@/lib/api/http";
import type { ActivityDetail } from "@/lib/domain/activity-types";
import { buildBoard, compareActivitiesAsc, resolveRange, streakWindow, type Board, type BoardView } from "@/lib/domain/board";

/**
 * The Board payload for GET /api/board and the ledger pages (§8.1): two
 * queries through the user's RLS-scoped client (the range's activities, and
 * the activity dates the current streak needs), then pure aggregation.
 */
export interface BoardPayload extends Board {
  /** Day view only: the day's activities in full (exercises → sets), in time order. */
  activities?: ActivityDetail[];
}

export async function loadBoard(
  supabase: SupabaseClient,
  prefs: Pick<UserPrefs, "today" | "weekStartsOn">,
  view: BoardView,
  date: string,
): Promise<{ data: BoardPayload; error: null } | { data: null; error: DbError }> {
  const range = resolveRange(view, date, prefs.weekStartsOn);
  const window = streakWindow(range, prefs.today);
  const [acts, dates] = await Promise.all([
    listActivities(supabase, { from: range.from, to: range.to }),
    listActivityDates(supabase, window),
  ]);
  if (acts.error) return { data: null, error: acts.error };
  if (dates.error) return { data: null, error: dates.error };

  const board = buildBoard({ range, today: prefs.today, activities: acts.data, streakDates: dates.data });
  return {
    data: view === "day" ? { ...board, activities: acts.data.slice().sort(compareActivitiesAsc) } : board,
    error: null,
  };
}
