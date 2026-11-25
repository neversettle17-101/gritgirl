/** Minimal JSON client for the cycle/settings API, used by client components. */

export interface ApiFailure {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

export async function putJson<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    return {
      ok: false,
      error: json?.error ?? { code: "http_error", message: `Request failed (${res.status})` },
    };
  } catch {
    return { ok: false, error: { code: "network", message: "You seem to be offline. Try again." } };
  }
}
