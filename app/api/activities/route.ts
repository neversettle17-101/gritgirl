import type { NextRequest } from "next/server";
import { getActivity, getUserPrefs, listActivities, saveActivity } from "@/lib/activities/repo";
import { apiError, dbErrorResponse, readJson, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { activityInputSchema, activityRangeSchema, fieldErrors } from "@/lib/validation/activities";

/** GET /api/activities?from=YYYY-MM-DD&to=YYYY-MM-DD — activities in range, with strength detail. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  const params = request.nextUrl.searchParams;
  const parsed = activityRangeSchema.safeParse({ from: params.get("from"), to: params.get("to") });
  if (!parsed.success) {
    return apiError(400, "bad_request", "Pass from and to as YYYY-MM-DD", fieldErrors(parsed.error));
  }

  const { data, error } = await listActivities(session.supabase, parsed.data);
  if (error) return dbErrorResponse(error, "list activities");
  return Response.json({ activities: data });
}

/** POST /api/activities — create a run, walk or strength workout (one transaction). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await readJson(request);
  if (body === null) return apiError(400, "bad_request", "Send a JSON body");

  const { today } = await getUserPrefs(session.supabase);
  const parsed = activityInputSchema(today).safeParse(body);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Check the highlighted fields", fieldErrors(parsed.error));
  }

  const saved = await saveActivity(session.supabase, parsed.data, false);
  if (saved.error) return dbErrorResponse(saved.error, "create activity");

  const { data, error } = await getActivity(session.supabase, saved.data);
  if (error || !data) return dbErrorResponse(error ?? {}, "read created activity");
  return Response.json({ activity: data }, { status: 201, headers: { Location: `/api/activities/${data.id}` } });
}
