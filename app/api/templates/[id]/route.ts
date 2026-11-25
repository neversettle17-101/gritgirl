import { apiError, dbErrorResponse, notFound, readJson, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { archiveTemplate, getTemplate, saveTemplate } from "@/lib/templates/repo";
import { fieldErrors, uuidParam } from "@/lib/validation/activities";
import { templateInputSchema } from "@/lib/validation/templates";

type Ctx = RouteContext<"/api/templates/[id]">;

const NOT_FOUND = "Regular not found";

async function idFrom(ctx: Ctx): Promise<string | null> {
  const { id } = await ctx.params;
  return uuidParam.safeParse(id).success ? id : null;
}

/** GET /api/templates/:id — one Regular with its exercises and usage (archived ones too). */
export async function GET(_request: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();
  const id = await idFrom(ctx);
  if (!id) return notFound(NOT_FOUND);

  const { data, error } = await getTemplate(session.supabase, id);
  if (error) return dbErrorResponse(error, "get template", NOT_FOUND);
  if (!data) return notFound(NOT_FOUND);
  return Response.json({ template: data });
}

/** PUT /api/templates/:id — replace the whole Regular (exercises too, in one transaction). */
export async function PUT(request: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();
  const id = await idFrom(ctx);
  if (!id) return notFound(NOT_FOUND);

  const body = await readJson(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "bad_request", "Send a JSON object");
  }
  const doc = body as Record<string, unknown>;
  if (doc.id !== undefined && doc.id !== id) {
    return apiError(422, "validation_failed", "The body id does not match the URL", { id: "Does not match the URL" });
  }

  const parsed = templateInputSchema.safeParse({ ...doc, id });
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Check the highlighted fields", fieldErrors(parsed.error));
  }

  const saved = await saveTemplate(session.supabase, parsed.data, true);
  if (saved.error) return dbErrorResponse(saved.error, "replace template", NOT_FOUND);

  const { data, error } = await getTemplate(session.supabase, id);
  if (error || !data) return dbErrorResponse(error ?? {}, "read replaced template", NOT_FOUND);
  return Response.json({ template: data });
}

/**
 * DELETE /api/templates/:id — archives the Regular. Activities logged from
 * it keep their data (and their link to it).
 */
export async function DELETE(_request: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();
  const id = await idFrom(ctx);
  if (!id) return notFound(NOT_FOUND);

  const { data, error } = await archiveTemplate(session.supabase, id);
  if (error) return dbErrorResponse(error, "archive template", NOT_FOUND);
  if (!data) return notFound(NOT_FOUND);
  return new Response(null, { status: 204 });
}
