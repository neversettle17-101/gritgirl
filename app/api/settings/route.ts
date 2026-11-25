import { handle, parseInput, readJson } from "@/lib/api/http";
import { requireCycleRepo } from "@/lib/cycle/server";
import { getSettings, updateSettings } from "@/lib/cycle/service";
import { settingsPutBody } from "@/lib/validation/cycle";

/** GET /api/settings → { settings } */
export function GET() {
  return handle(async () => {
    const repo = await requireCycleRepo();
    return Response.json({ settings: await getSettings(repo) });
  });
}

/** PUT /api/settings — partial update; `completeOnboarding: true` marks onboarding done. */
export function PUT(request: Request) {
  return handle(async () => {
    const body = parseInput(settingsPutBody, await readJson(request));
    const repo = await requireCycleRepo();
    return Response.json({ settings: await updateSettings(repo, body) });
  });
}
