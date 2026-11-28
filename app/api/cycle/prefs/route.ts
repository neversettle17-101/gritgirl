import { apiError, dbErrorResponse, readJson, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { updateCycleMarkPrefs } from "@/lib/cycle/period-days";
import { getCycleMarkPrefs } from "@/lib/cycle/repo";
import { fieldErrors } from "@/lib/validation/activities";
import { cycleMarkPrefsPatchSchema } from "@/lib/validation/cycle";

const NOT_FOUND = "Settings not found";

/** GET /api/cycle/prefs — the cycle desk switches { circleLedgers, circleProgress }. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  const { data, error } = await getCycleMarkPrefs(session.supabase);
  if (error) return dbErrorResponse(error, "read cycle prefs", NOT_FOUND);
  return Response.json({ prefs: data });
}

/** PATCH /api/cycle/prefs { circleLedgers?, circleProgress? } — where period days get circled. */
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await readJson(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "bad_request", "Send a JSON object");
  }

  const parsed = cycleMarkPrefsPatchSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "validation_failed", "Check the highlighted fields", fieldErrors(parsed.error));

  const { data, error } = await updateCycleMarkPrefs(session.supabase, session.userId, parsed.data);
  if (error) return dbErrorResponse(error, "update cycle prefs", NOT_FOUND);
  return Response.json({ prefs: data });
}
