import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listActivities, listActivityDates, type UserPrefs } from "@/lib/activities/repo";
import type { DbError } from "@/lib/api/http";
import { loadPeriodMarks } from "@/lib/cycle/repo";
import type { ActivityDetail } from "@/lib/domain/activity-types";
import { buildBoard, compareActivitiesAsc, resolveRange, streakWindow, type Board, type BoardView } from "@/lib/domain/board";
import type { PeriodMark } from "@/lib/domain/period-marks";

/**
 * The Board payload for GET /api/board and the ledger pages (§8.1): queries
 * through the user's RLS-scoped client (the range's activities, the activity
 * dates the current streak needs and, on the Week / Month ledgers, the logged
 * period days to circle), run in parallel, then pure aggregation.
 */
export interface BoardPayload extends Board {
  /** Day view only: the day's activities in full (exercises → sets), in time order. */
  activities?: ActivityDetail[];
  /**
   * Week and month views only: logged period days in [range.from, range.to],
   * numbered DAY 1, DAY 2 … Empty when the user's "circle it on my ledgers"
   * switch is off.
   */
  periodMarks?: PeriodMark[];
}

/** The views whose ledgers circle period days (CycWeek / CycMonth). */
const PERIOD_VIEWS: ReadonlySet<BoardView> = new Set(["week", "month"]);

export async function loadBoard(
  supabase: SupabaseClient,
  prefs: Pick<UserPrefs, "today" | "weekStartsOn">,
  view: BoardView,
  date: string,
  opts: { periodMarks?: boolean } = {},
): Promise<{ data: BoardPayload; error: null } | { data: null; error: DbError }> {
  const range = resolveRange(view, date, prefs.weekStartsOn);
  const window = streakWindow(range, prefs.today);
  const withMarks = (opts.periodMarks ?? true) && PERIOD_VIEWS.has(view);
  const [acts, dates, marks] = await Promise.all([
    listActivities(supabase, { from: range.from, to: range.to }),
    listActivityDates(supabase, window),
    withMarks ? loadPeriodMarks(supabase, { from: range.from, to: range.to }, "ledgers") : null,
  ]);
  if (acts.error) return { data: null, error: acts.error };
  if (dates.error) return { data: null, error: dates.error };
  if (marks?.error) return { data: null, error: marks.error };

  const board: BoardPayload = buildBoard({ range, today: prefs.today, activities: acts.data, streakDates: dates.data });
  if (view === "day") board.activities = acts.data.slice().sort(compareActivitiesAsc);
  if (marks) board.periodMarks = marks.data;
  return { data: board, error: null };
}
