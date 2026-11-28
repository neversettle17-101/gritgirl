import type { NextRequest } from "next/server";
import { getUserPrefs } from "@/lib/activities/repo";
import { apiError, dbErrorResponse, readJson, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { addPeriodDates } from "@/lib/cycle/period-days";
import { listPeriodDates } from "@/lib/cycle/repo";
import { checkPeriodDaysAdd, checkPeriodRange } from "@/lib/validation/cycle";

const NOT_FOUND = "Period day not found";

/** GET /api/period-days?from=YYYY-MM-DD&to=YYYY-MM-DD — my logged period days in that range, ascending. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  const params = request.nextUrl.searchParams;
  const checked = checkPeriodRange({ from: params.get("from") ?? undefined, to: params.get("to") ?? undefined });
  if (!checked.ok) return apiError(400, "bad_request", "Pass from=YYYY-MM-DD and to=YYYY-MM-DD", checked.fields);

  const { data, error } = await listPeriodDates(session.supabase, checked.data);
  if (error) return dbErrorResponse(error, "list period days", NOT_FOUND);
  return Response.json({ dates: data });
}

/**
 * POST /api/period-days { dates: ["YYYY-MM-DD", …] } — mark these days.
 * Idempotent: days already marked stay as they are.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await readJson(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "bad_request", "Send a JSON object");
  }

  const prefs = await getUserPrefs(session.supabase);
  const checked = checkPeriodDaysAdd(body, prefs.today);
  if (!checked.ok) return apiError(422, "validation_failed", "Check the highlighted fields", checked.fields);

  const { data, error } = await addPeriodDates(session.supabase, session.userId, checked.data);
  if (error) return dbErrorResponse(error, "add period days", NOT_FOUND);
  return Response.json({ dates: data });
}
