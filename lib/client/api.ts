"use client";

import type { ActivityDetail, ExerciseSummary, LastSets } from "@/lib/domain/activity-types";
import type { ActivityPayload } from "@/lib/validation/activities";
import type { CustomExerciseInput } from "@/lib/validation/exercises";

/** Browser-side calls to our own /api route handlers. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "network", "No connection. Your slip is still here; try again.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? "unknown", e.message ?? "Something went wrong", e.fields ?? {});
  }
  return body as T;
}

export async function createActivity(doc: ActivityPayload): Promise<ActivityDetail> {
  return (await call<{ activity: ActivityDetail }>("/api/activities", { method: "POST", body: JSON.stringify(doc) }))
    .activity;
}

export async function replaceActivity(doc: ActivityPayload): Promise<ActivityDetail> {
  return (
    await call<{ activity: ActivityDetail }>(`/api/activities/${doc.id}`, {
      method: "PUT",
      body: JSON.stringify(doc),
    })
  ).activity;
}

/** keepalive lets the delete finish even if the page is closing. */
export async function deleteActivity(id: string, keepalive = false): Promise<void> {
  try {
    await call<void>(`/api/activities/${id}`, { method: "DELETE", keepalive });
  } catch (e) {
    // Already gone counts as deleted.
    if (e instanceof ApiError && e.status === 404) return;
    throw e;
  }
}

export async function searchExercises(
  params: { q?: string; muscle?: string; equipment?: string; limit?: number },
  signal?: AbortSignal,
): Promise<ExerciseSummary[]> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
  return (await call<{ exercises: ExerciseSummary[] }>(`/api/exercises?${sp}`, { signal })).exercises;
}

export async function createExercise(input: Partial<CustomExerciseInput> & { name: string }): Promise<ExerciseSummary> {
  return (await call<{ exercise: ExerciseSummary }>("/api/exercises", { method: "POST", body: JSON.stringify(input) }))
    .exercise;
}

export async function lastSets(exerciseId: string): Promise<LastSets | null> {
  try {
    return (await call<{ last: LastSets | null }>(`/api/exercises/${exerciseId}/last`)).last;
  } catch {
    return null; // pre-fill is a nicety; never block adding the exercise
  }
}
