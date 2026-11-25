import { handle, parseInput, readJson, searchParamsObject } from "@/lib/api/http";
import { requireCycleRepo } from "@/lib/cycle/server";
import { listPeriodDays, writePeriodDays } from "@/lib/cycle/service";
import { dateRangeQuery, periodDaysPutBody } from "@/lib/validation/cycle";

/** GET /api/period-days?from=YYYY-MM-DD&to=YYYY-MM-DD → { days: [{ date, flow }] } */
export function GET(request: Request) {
  return handle(async () => {
    const range = parseInput(dateRangeQuery, searchParamsObject(request));
    const repo = await requireCycleRepo();
    return Response.json({ days: await listPeriodDays(repo, range) });
  });
}

/**
 * PUT /api/period-days — set / clear / replace the logged days in a range.
 * Body: see periodDaysPutBody. Returns the logged days in [from, to].
 */
export function PUT(request: Request) {
  return handle(async () => {
    const body = parseInput(periodDaysPutBody, await readJson(request));
    const repo = await requireCycleRepo();
    return Response.json({ days: await writePeriodDays(repo, body) });
  });
}
