import { getUserPrefs } from "@/lib/activities/repo";
import { apiError, dbErrorResponse, readJson, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { listBodyWeights, RECENT_WEIGHTS, upsertBodyWeight } from "@/lib/profile/repo";
import { checkBodyWeight } from "@/lib/validation/profile";

const NOT_FOUND = "Weigh-in not found";

/** GET /api/body-weight — my recent weigh-ins, latest first. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  const { data, error } = await listBodyWeights(session.supabase, RECENT_WEIGHTS);
  if (error) return dbErrorResponse(error, "list body weights", NOT_FOUND);
  return Response.json({ bodyWeights: data });
}

/**
 * POST /api/body-weight { weightKg, measuredOn? } — log a weigh-in (kg).
 * measuredOn defaults to today; logging the same date again replaces it.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await readJson(request);
  if (body === null) return apiError(400, "bad_request", "Send a JSON body");

  const prefs = await getUserPrefs(session.supabase);
  const checked = checkBodyWeight(body, prefs.today);
  if (!checked.ok) return apiError(422, "validation_failed", "Check the highlighted fields", checked.fields);

  const { data, error } = await upsertBodyWeight(session.supabase, session.userId, checked.data);
  if (error) return dbErrorResponse(error, "save body weight", NOT_FOUND);
  return Response.json({ bodyWeight: data }, { status: 201 });
}
