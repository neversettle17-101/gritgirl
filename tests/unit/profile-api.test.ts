import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkBodyWeight, checkProfilePatch } from "@/lib/validation/profile";

// /api/profile and /api/body-weight route handlers with a fake supabase
// client: validation, status codes, unit-free canonical values, and what
// reaches the database. RLS and constraints: tests/db/profile.test.ts.

vi.mock("server-only", () => ({}));

const SETTINGS = {
  display_name: null as string | null,
  height_cm: null as number | string | null,
  date_of_birth: null as string | null,
  weight_unit: "kg",
  distance_unit: "km",
  week_starts_on: 1,
  timezone: "UTC",
};

const state = {
  signedIn: true,
  settings: { ...SETTINGS },
  weights: [] as { id: string; measured_on: string; weight_kg: number | string }[],
  calls: [] as { table: string; op: string; arg?: unknown; opts?: unknown }[],
  dbError: null as null | { code: string },
};

function fakeQuery(table: string) {
  let op = "select";
  const q: Record<string, unknown> = {};
  const record = (o: string, arg?: unknown, opts?: unknown) => state.calls.push({ table, op: o, arg, opts });
  Object.assign(q, {
    select: () => q,
    eq: (col: string, v: unknown) => {
      record("eq", [col, v]);
      return q;
    },
    order: () => q,
    limit: (n: number) => {
      record("limit", n);
      return q;
    },
    update: (row: Record<string, unknown>) => {
      op = "update";
      record("update", row);
      Object.assign(state.settings, row);
      return q;
    },
    upsert: (row: unknown, opts: unknown) => {
      op = "upsert";
      record("upsert", row, opts);
      return q;
    },
    delete: () => {
      op = "delete";
      record("delete");
      return q;
    },
    maybeSingle: async () => ({ data: state.dbError ? null : state.settings, error: state.dbError }),
    single: async () => {
      if (state.dbError) return { data: null, error: state.dbError };
      const up = state.calls.findLast((c) => c.op === "upsert")!.arg as { measured_on: string; weight_kg: number };
      return { data: { id: "w-new", ...up, weight_kg: String(up.weight_kg) }, error: null };
    },
    returns: async () => ({ data: state.weights, error: null }),
    then: (resolve: (v: unknown) => void) => {
      // awaited directly: the delete().eq().select() chain
      const id = (state.calls.findLast((c) => c.op === "eq")!.arg as [string, string])[1];
      resolve({ data: op === "delete" ? state.weights.filter((w) => w.id === id) : [], error: null });
    },
  });
  return q;
}

vi.mock("@/lib/api/session", () => ({
  getSession: async () =>
    state.signedIn ? { supabase: { from: (t: string) => fakeQuery(t) }, userId: "user-1" } : null,
}));

const profileRoute = await import("@/app/api/profile/route");
const weightRoute = await import("@/app/api/body-weight/route");
const weightOne = await import("@/app/api/body-weight/[id]/route");

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    headers: { "content-type": "application/json" },
  });

const W1 = "11111111-1111-4111-8111-111111111111";
const TODAY = new Date().toISOString().slice(0, 10); // settings timezone is UTC

beforeEach(() => {
  state.signedIn = true;
  state.settings = { ...SETTINGS };
  state.weights = [];
  state.calls = [];
  state.dbError = null;
});

describe("validation", () => {
  it("accepts a partial patch and trims / clears the name", () => {
    expect(checkProfilePatch({ displayName: "  Asha  " }, "2026-11-25")).toEqual({ ok: true, data: { displayName: "Asha" } });
    expect(checkProfilePatch({ displayName: "   " }, "2026-11-25")).toEqual({ ok: true, data: { displayName: null } });
    expect(checkProfilePatch({ heightCm: 165.06, dateOfBirth: null }, "2026-11-25")).toEqual({
      ok: true,
      data: { heightCm: 165.1, dateOfBirth: null },
    });
  });

  it("rejects out-of-range and unknown fields", () => {
    const bad = (body: unknown) => checkProfilePatch(body, "2026-11-25");
    expect(bad({ heightCm: 20 })).toMatchObject({ ok: false, fields: { heightCm: expect.any(String) } });
    expect(bad({ heightCm: 300 })).toMatchObject({ ok: false, fields: { heightCm: expect.any(String) } });
    expect(bad({ heightCm: "165" })).toMatchObject({ ok: false });
    expect(bad({ weightUnit: "st" })).toMatchObject({ ok: false, fields: { weightUnit: "Use kg or lb" } });
    expect(bad({ weekStartsOn: 7 })).toMatchObject({ ok: false });
    expect(bad({ displayName: "x".repeat(61) })).toMatchObject({ ok: false });
    expect(bad({ dateOfBirth: "2026-11-26" })).toMatchObject({ ok: false, fields: { dateOfBirth: expect.stringMatching(/future/) } });
    expect(bad({ dateOfBirth: "1850-01-01" })).toMatchObject({ ok: false });
    expect(bad({ timezone: "UTC" })).toMatchObject({ ok: false }); // not editable here
    expect(bad({ defaultCycleLen: 30 })).toMatchObject({ ok: false });
  });

  it("checks weigh-ins", () => {
    expect(checkBodyWeight({ weightKg: 62.444 }, "2026-11-25")).toEqual({
      ok: true,
      data: { weightKg: 62.44, measuredOn: "2026-11-25" },
    });
    expect(checkBodyWeight({ weightKg: 19.9 }, "2026-11-25")).toMatchObject({ ok: false });
    expect(checkBodyWeight({ weightKg: 401 }, "2026-11-25")).toMatchObject({ ok: false });
    expect(checkBodyWeight({ weightKg: 60, measuredOn: "2026-11-26" }, "2026-11-25")).toMatchObject({
      ok: false,
      fields: { measuredOn: expect.any(String) },
    });
    expect(checkBodyWeight({}, "2026-11-25")).toMatchObject({ ok: false, fields: { weightKg: expect.any(String) } });
  });
});

describe("/api/profile", () => {
  it("401s when signed out", async () => {
    state.signedIn = false;
    expect((await profileRoute.GET()).status).toBe(401);
    expect((await profileRoute.PATCH(req("/api/profile", "PATCH", { displayName: "A" }))).status).toBe(401);
  });

  it("GET returns the profile and recent weigh-ins", async () => {
    state.settings.height_cm = "165.0";
    state.weights = [{ id: W1, measured_on: "2026-11-24", weight_kg: "62.40" }];
    const body = await (await profileRoute.GET()).json();
    expect(body).toEqual({
      profile: { displayName: null, heightCm: 165, dateOfBirth: null, weightUnit: "kg", distanceUnit: "km", weekStartsOn: 1 },
      bodyWeights: [{ id: W1, measuredOn: "2026-11-24", weightKg: 62.4 }],
    });
    expect(state.calls).toContainEqual({ table: "body_weight_entries", op: "limit", arg: 8, opts: undefined });
  });

  it("PATCH writes only the given columns, scoped to me", async () => {
    const res = await profileRoute.PATCH(
      req("/api/profile", "PATCH", { displayName: "Asha", heightCm: 165.1, distanceUnit: "mi", weekStartsOn: 0 }),
    );
    expect(res.status).toBe(200);
    const update = state.calls.find((c) => c.op === "update")!;
    expect(update.arg).toEqual({ display_name: "Asha", height_cm: 165.1, distance_unit: "mi", week_starts_on: 0 });
    expect(state.calls).toContainEqual({ table: "user_settings", op: "eq", arg: ["user_id", "user-1"], opts: undefined });
    expect((await res.json()).profile).toMatchObject({ displayName: "Asha", heightCm: 165.1, distanceUnit: "mi", weekStartsOn: 0 });
  });

  it("PATCH 422s with field errors and writes nothing", async () => {
    const res = await profileRoute.PATCH(req("/api/profile", "PATCH", { heightCm: 999 }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatchObject({ code: "validation_failed", fields: { heightCm: expect.any(String) } });
    expect(state.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("PATCH 400s on a non-object body", async () => {
    expect((await profileRoute.PATCH(req("/api/profile", "PATCH", "nope"))).status).toBe(400);
    expect((await profileRoute.PATCH(req("/api/profile", "PATCH", [1]))).status).toBe(400);
  });

  it("maps database check failures to 422", async () => {
    const res = await profileRoute.PATCH(req("/api/profile", "PATCH", { displayName: "A" }));
    expect(res.status).toBe(200);
    state.dbError = { code: "23514" };
    expect((await profileRoute.GET()).status).toBe(422);
  });
});

describe("/api/body-weight", () => {
  it("POST upserts one weigh-in per day, defaulting to today", async () => {
    const res = await weightRoute.POST(req("/api/body-weight", "POST", { weightKg: 62.4 }));
    expect(res.status).toBe(201);
    const up = state.calls.find((c) => c.op === "upsert")!;
    expect(up.arg).toEqual({ user_id: "user-1", measured_on: TODAY, weight_kg: 62.4 });
    expect(up.opts).toEqual({ onConflict: "user_id,measured_on" });
    expect((await res.json()).bodyWeight).toEqual({ id: "w-new", measuredOn: TODAY, weightKg: 62.4 });
  });

  it("POST validates", async () => {
    const res = await weightRoute.POST(req("/api/body-weight", "POST", { weightKg: 5 }));
    expect(res.status).toBe(422);
    expect((await weightRoute.POST(req("/api/body-weight", "POST", "{"))).status).toBe(400);
    expect(state.calls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("GET lists recent weigh-ins", async () => {
    state.weights = [{ id: W1, measured_on: "2026-11-24", weight_kg: 62.4 }];
    expect(await (await weightRoute.GET()).json()).toEqual({ bodyWeights: [{ id: W1, measuredOn: "2026-11-24", weightKg: 62.4 }] });
  });

  it("DELETE removes mine, 404s otherwise", async () => {
    state.weights = [{ id: W1, measured_on: "2026-11-24", weight_kg: 62.4 }];
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    expect((await weightOne.DELETE(req(`/api/body-weight/${W1}`, "DELETE"), ctx(W1))).status).toBe(204);
    const other = "22222222-2222-4222-8222-222222222222";
    expect((await weightOne.DELETE(req(`/api/body-weight/${other}`, "DELETE"), ctx(other))).status).toBe(404);
    expect((await weightOne.DELETE(req("/api/body-weight/x", "DELETE"), ctx("not-a-uuid"))).status).toBe(404);
  });
});
