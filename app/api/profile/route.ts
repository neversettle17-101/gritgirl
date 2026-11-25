import { getUserPrefs } from "@/lib/activities/repo";
import { apiError, dbErrorResponse, readJson, unauthorized } from "@/lib/api/http";
import { getSession } from "@/lib/api/session";
import { getProfile, listBodyWeights, updateProfile } from "@/lib/profile/repo";
import { checkProfilePatch } from "@/lib/validation/profile";

const NOT_FOUND = "Profile not found";

/** GET /api/profile — about-you details, unit settings, and recent weigh-ins (latest first). */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const [profile, weights] = await Promise.all([getProfile(session.supabase), listBodyWeights(session.supabase)]);
  if (profile.error) return dbErrorResponse(profile.error, "read profile", NOT_FOUND);
  if (weights.error) return dbErrorResponse(weights.error, "list body weights", NOT_FOUND);
  return Response.json({ profile: profile.data, bodyWeights: weights.data });
}

/**
 * PATCH /api/profile — change any of displayName, heightCm, dateOfBirth,
 * weightUnit, distanceUnit, weekStartsOn. null clears an optional field.
 */
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await readJson(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "bad_request", "Send a JSON object");
  }

  const prefs = await getUserPrefs(session.supabase);
  const checked = checkProfilePatch(body, prefs.today);
  if (!checked.ok) return apiError(422, "validation_failed", "Check the highlighted fields", checked.fields);

  const { data, error } = await updateProfile(session.supabase, session.userId, checked.data);
  if (error) return dbErrorResponse(error, "update profile", NOT_FOUND);
  return Response.json({ profile: data });
}
