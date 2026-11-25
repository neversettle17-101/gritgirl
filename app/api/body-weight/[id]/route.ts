import { dbErrorResponse, notFound, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { deleteBodyWeight } from "@/lib/profile/repo";
import { uuidParam } from "@/lib/validation/activities";

const NOT_FOUND = "Weigh-in not found";

/** DELETE /api/body-weight/:id — remove one of my weigh-ins. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/body-weight/[id]">) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  if (!uuidParam.safeParse(id).success) return notFound(NOT_FOUND);

  const { data, error } = await deleteBodyWeight(session.supabase, id);
  if (error) return dbErrorResponse(error, "delete body weight", NOT_FOUND);
  if (!data) return notFound(NOT_FOUND);
  return new Response(null, { status: 204 });
}
