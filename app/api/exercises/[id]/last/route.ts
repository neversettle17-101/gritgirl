import { lastSetsFor } from "@/lib/activities/repo";
import { dbErrorResponse, notFound, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { uuidParam } from "@/lib/validation/activities";

/** GET /api/exercises/:id/last — my most recent sets for this exercise (pre-fill), or null. */
export async function GET(_request: Request, ctx: RouteContext<"/api/exercises/[id]/last">) {
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await ctx.params;
  if (!uuidParam.safeParse(id).success) return notFound("Exercise not found");

  const { data, error } = await lastSetsFor(session.supabase, id);
  if (error) return dbErrorResponse(error, "last sets");
  return Response.json({ last: data });
}
