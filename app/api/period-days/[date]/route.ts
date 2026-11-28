import { dbErrorResponse, notFound, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { removePeriodDate } from "@/lib/cycle/period-days";
import { isIsoDate } from "@/lib/domain/dates";

const NOT_FOUND = "Period day not found";

/** DELETE /api/period-days/:date — unmark a day. Idempotent: 204 whether or not it was marked. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/period-days/[date]">) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { date } = await ctx.params;
  if (!isIsoDate(date)) return notFound(NOT_FOUND);

  const { error } = await removePeriodDate(session.supabase, session.userId, date);
  if (error) return dbErrorResponse(error, "remove period day", NOT_FOUND);
  return new Response(null, { status: 204 });
}
