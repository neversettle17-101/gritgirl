/**
 * JSON helpers for the /api route handlers (technical design §10).
 * Errors always come back as { error: { code, message, fields? } }.
 * Never log request bodies: cycle and health data are sensitive (§11).
 */

export type ApiErrorCode =
  | "unauthorized"
  | "bad_request"
  | "validation_failed"
  | "not_found"
  | "conflict"
  | "internal";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; fields?: Record<string, string> };
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>,
): Response {
  const body: ApiErrorBody = { error: { code, message, ...(fields ? { fields } : {}) } };
  return Response.json(body, { status });
}

export const unauthorized = () => apiError(401, "unauthorized", "Sign in required");
export const notFound = (what = "Not found") => apiError(404, "not_found", what);

/** Reads a JSON body; null when it is missing or not JSON. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Minimal shape of a PostgREST / Postgres error. */
export interface DbError {
  code?: string;
  message?: string;
}

/**
 * Maps a database error (SQLSTATE in `code`) to an API response. Constraint
 * and cast failures are the client's fault (422); unknown errors are 500 and
 * logged by code only.
 */
export function dbErrorResponse(err: DbError, context: string): Response {
  switch (err.code) {
    case "P0002":
      return notFound("Activity not found");
    case "23503":
      return apiError(422, "validation_failed", "One of the exercises does not exist", {
        exercises: "Unknown exercise",
      });
    case "23505":
      return apiError(409, "conflict", "That id is already in use");
    case "23514":
    case "23502":
    case "22P02":
    case "22003":
    case "22007":
    case "22008":
    case "22023":
      return apiError(422, "validation_failed", "The data did not pass the database checks");
    case "42501":
      return unauthorized();
    default:
      console.error(`[api] ${context} failed`, { code: err.code ?? "unknown" });
      return apiError(500, "internal", "Something went wrong. Try again.");
  }
}
