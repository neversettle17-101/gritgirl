import type { NextRequest } from "next/server";
import { apiError, dbErrorResponse, readJson, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { getTemplate, listTemplates, saveTemplate } from "@/lib/templates/repo";
import { fieldErrors } from "@/lib/validation/activities";
import { templateInputSchema } from "@/lib/validation/templates";

const NOT_FOUND = "Regular not found";

/**
 * GET /api/templates — my Regulars with usage ("used 12×", last used), most
 * used first. ?archived=1 includes archived ones.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  const includeArchived = request.nextUrl.searchParams.get("archived") === "1";
  const { data, error } = await listTemplates(session.supabase, { includeArchived });
  if (error) return dbErrorResponse(error, "list templates", NOT_FOUND);
  return Response.json({ templates: data });
}

/** POST /api/templates — create a run, walk or strength Regular (one transaction). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await readJson(request);
  if (body === null) return apiError(400, "bad_request", "Send a JSON body");

  const parsed = templateInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Check the highlighted fields", fieldErrors(parsed.error));
  }

  const saved = await saveTemplate(session.supabase, parsed.data, false);
  if (saved.error) return dbErrorResponse(saved.error, "create template", NOT_FOUND);

  const { data, error } = await getTemplate(session.supabase, saved.data);
  if (error || !data) return dbErrorResponse(error ?? {}, "read created template", NOT_FOUND);
  return Response.json({ template: data }, { status: 201, headers: { Location: `/api/templates/${data.id}` } });
}
