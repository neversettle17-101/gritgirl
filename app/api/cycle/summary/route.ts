import { z } from "zod";
import { handle, parseInput, searchParamsObject } from "@/lib/api/http";
import { requireCycleRepo } from "@/lib/cycle/server";
import { getCycleSummary } from "@/lib/cycle/service";
import { isoDate } from "@/lib/validation/cycle";

const query = z.object({ today: isoDate.optional() });

/**
 * GET /api/cycle/summary[?today=YYYY-MM-DD] → { summary }
 * Current phase and cycle day, next period estimate, average cycle and period
 * length. `today` defaults to the user's local date. All values are estimates.
 */
export function GET(request: Request) {
  return handle(async () => {
    const { today } = parseInput(query, searchParamsObject(request));
    const repo = await requireCycleRepo();
    return Response.json({ summary: await getCycleSummary(repo, { today }) });
  });
}
