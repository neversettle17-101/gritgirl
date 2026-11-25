import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { ApiError } from "@/lib/cycle/service";
import { fieldErrors } from "@/lib/validation/cycle";

/**
 * Shared helpers for /api route handlers (technical design §10).
 * Errors are always `{ error: { code, message, fields? } }`.
 */

export function errorResponse(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): Response {
  return Response.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

/** Parses `input` with `schema`, or throws a 400 ApiError listing the bad fields. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, "invalid_input", "Some fields are invalid", fieldErrors(result.error));
  }
  return result.data;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be JSON");
  }
}

export function searchParamsObject(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

/**
 * Runs a handler body and maps failures to the error envelope. Unexpected
 * errors are logged by message only: request bodies (cycle data is health
 * data) never reach the logs.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    // Let Next's own control-flow errors (prerender bail-out, redirect) through.
    unstable_rethrow(err);
    if (err instanceof ApiError) return errorResponse(err.status, err.code, err.message, err.fields);
    console.error("[api] unexpected error:", err instanceof Error ? err.message : "unknown");
    return errorResponse(500, "internal", "Something went wrong");
  }
}
