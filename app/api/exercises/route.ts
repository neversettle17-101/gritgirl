import type { NextRequest } from "next/server";
import { createCustomExercise, searchExercises } from "@/lib/activities/repo";
import { apiError, dbErrorResponse, readJson, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { fieldErrors } from "@/lib/validation/activities";
import { customExerciseSchema, exerciseSearchSchema } from "@/lib/validation/exercises";

/**
 * GET /api/exercises?q=&muscle=&equipment=&limit= — the library plus my custom
 * exercises. Typo-tolerant (pg_trgm), filterable by primary muscle and equipment.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  const p = request.nextUrl.searchParams;
  const parsed = exerciseSearchSchema.safeParse({
    q: p.get("q"),
    muscle: p.get("muscle"),
    equipment: p.get("equipment"),
    limit: p.get("limit"),
  });
  if (!parsed.success) {
    return apiError(400, "bad_request", "Invalid search", fieldErrors(parsed.error));
  }

  const { data, error } = await searchExercises(session.supabase, parsed.data);
  if (error) return dbErrorResponse(error, "search exercises");
  return Response.json({ exercises: data });
}

/** POST /api/exercises — create a custom exercise (only I can see it). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await readJson(request);
  if (body === null) return apiError(400, "bad_request", "Send a JSON body");
  const parsed = customExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Check the highlighted fields", fieldErrors(parsed.error));
  }

  const { data, error } = await createCustomExercise(session.supabase, session.userId, parsed.data);
  if (error) return dbErrorResponse(error, "create exercise");
  return Response.json({ exercise: data }, { status: 201 });
}
