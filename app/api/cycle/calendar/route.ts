import { handle, parseInput, searchParamsObject } from "@/lib/api/http";
import { requireCycleRepo } from "@/lib/cycle/server";
import { getCycleCalendar } from "@/lib/cycle/service";
import { dateRangeQuery } from "@/lib/validation/cycle";

/**
 * GET /api/cycle/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   → { days: [{ date, phase, cycleDay, isPeriod, flow, predicted }] }
 * Per-day phase estimates for the ledgers (the shape <PhaseBand> takes).
 */
export function GET(request: Request) {
  return handle(async () => {
    const range = parseInput(dateRangeQuery, searchParamsObject(request));
    const repo = await requireCycleRepo();
    return Response.json({ days: await getCycleCalendar(repo, range) });
  });
}
