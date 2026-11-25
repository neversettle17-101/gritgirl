import type { NextRequest } from "next/server";
import { getUserPrefs } from "@/lib/activities/repo";
import { apiError, dbErrorResponse, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { loadBoard } from "@/lib/board/load";
import { fieldErrors } from "@/lib/validation/activities";
import { boardQuerySchema } from "@/lib/validation/board";

/**
 * GET /api/board?view=day|week|month|year&date=YYYY-MM-DD — the ledger payload
 * (§8.1): per-day minutes and distance by type, activity summaries, totals and
 * streaks. Weeks start on user_settings.week_starts_on; months are padded to
 * whole weeks; years run 1 Jan–31 Dec. `date` defaults to today in the user's time zone.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  const params = request.nextUrl.searchParams;
  const parsed = boardQuerySchema.safeParse({
    view: params.get("view") ?? undefined,
    date: params.get("date") ?? undefined,
  });
  if (!parsed.success) {
    return apiError(400, "bad_request", "Pass view=day|week|month|year and date=YYYY-MM-DD", fieldErrors(parsed.error));
  }

  const prefs = await getUserPrefs(session.supabase);
  const { data, error } = await loadBoard(session.supabase, prefs, parsed.data.view, parsed.data.date ?? prefs.today);
  if (error) return dbErrorResponse(error, "load board");
  return Response.json(data);
}
