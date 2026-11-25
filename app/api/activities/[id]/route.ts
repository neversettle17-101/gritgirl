import { deleteActivity, getActivity, getUserPrefs, saveActivity } from "@/lib/activities/repo";
import { apiError, dbErrorResponse, notFound, readJson, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { activityInputSchema, fieldErrors, uuidParam } from "@/lib/validation/activities";

type Ctx = RouteContext<"/api/activities/[id]">;

async function idFrom(ctx: Ctx): Promise<string | null> {
  const { id } = await ctx.params;
  return uuidParam.safeParse(id).success ? id : null;
}

/** GET /api/activities/:id — one activity with full detail. */
export async function GET(_request: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();
  const id = await idFrom(ctx);
  if (!id) return notFound("Activity not found");

  const { data, error } = await getActivity(session.supabase, id);
  if (error) return dbErrorResponse(error, "get activity");
  if (!data) return notFound("Activity not found");
  return Response.json({ activity: data });
}

/**
 * PUT /api/activities/:id — replace the whole activity. For strength, the
 * exercises and sets are replaced in the same transaction (§6).
 */
export async function PUT(request: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();
  const id = await idFrom(ctx);
  if (!id) return notFound("Activity not found");

  const body = await readJson(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "bad_request", "Send a JSON object");
  }
  const doc = body as Record<string, unknown>;
  if (doc.id !== undefined && doc.id !== id) {
    return apiError(422, "validation_failed", "The body id does not match the URL", { id: "Does not match the URL" });
  }

  const { today } = await getUserPrefs(session.supabase);
  const parsed = activityInputSchema(today).safeParse({ ...doc, id });
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Check the highlighted fields", fieldErrors(parsed.error));
  }

  const saved = await saveActivity(session.supabase, parsed.data, true);
  if (saved.error) return dbErrorResponse(saved.error, "replace activity");

  const { data, error } = await getActivity(session.supabase, id);
  if (error || !data) return dbErrorResponse(error ?? {}, "read replaced activity");
  return Response.json({ activity: data });
}

/** DELETE /api/activities/:id — cascades to exercises and sets. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();
  const id = await idFrom(ctx);
  if (!id) return notFound("Activity not found");

  const { data, error } = await deleteActivity(session.supabase, id);
  if (error) return dbErrorResponse(error, "delete activity");
  if (!data) return notFound("Activity not found");
  return new Response(null, { status: 204 });
}
