import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbErrorResponse } from "@/lib/api/http";
import { mapActivity, mapLastSets, type ActivityRow } from "@/lib/activities/mappers";

// Route handlers with a fake supabase client: checks status codes, the error
// body shape (§10), and that the database receives the validated document.
// The real SQL behind the RPCs is covered by tests/db/activity-functions.test.ts.

vi.mock("server-only", () => ({}));

interface Call {
  kind: "rpc" | "from";
  name: string;
  args?: unknown;
}

const state: {
  signedIn: boolean;
  calls: Call[];
  rpc: Record<string, { data: unknown; error: unknown }>;
  activityRow: ActivityRow | null;
  deleted: unknown[];
} = { signedIn: true, calls: [], rpc: {}, activityRow: null, deleted: [] };

function fakeQuery(table: string) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  Object.assign(q, {
    select: chain,
    eq: chain,
    gte: chain,
    lte: chain,
    order: chain,
    delete: () => {
      state.calls.push({ kind: "from", name: `${table}.delete` });
      return {
        eq: () => ({ select: async () => ({ data: state.deleted, error: null }) }),
      };
    },
    returns: async () => ({ data: state.activityRow ? [state.activityRow] : [], error: null }),
    maybeSingle: async () => {
      if (table === "user_settings") {
        return { data: { weight_unit: "kg", distance_unit: "km", timezone: "Asia/Kolkata" }, error: null };
      }
      return { data: state.activityRow, error: null };
    },
  });
  return q;
}

const fakeSupabase = {
  from: (table: string) => fakeQuery(table),
  rpc: async (name: string, args: unknown) => {
    state.calls.push({ kind: "rpc", name, args });
    return state.rpc[name] ?? { data: null, error: null };
  },
};

vi.mock("@/lib/api/session", () => ({
  getSession: async () => (state.signedIn ? { supabase: fakeSupabase, userId: "user-1" } : null),
}));

const activitiesRoute = await import("@/app/api/activities/route");
const activityRoute = await import("@/app/api/activities/[id]/route");
const exercisesRoute = await import("@/app/api/exercises/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const row = (id: string, o: Partial<ActivityRow> = {}): ActivityRow => ({
  id,
  type: "running",
  date: "2020-01-01",
  start_time: "07:15:00",
  duration_sec: 1864,
  notes: null,
  feel: "spicy",
  distance_m: 5200,
  avg_heart_rate: 152,
  template_id: null,
  created_at: "2020-01-01T07:00:00Z",
  updated_at: "2020-01-01T07:00:00Z",
  activity_exercises: [],
  ...o,
});

beforeEach(() => {
  state.signedIn = true;
  state.calls = [];
  state.rpc = {};
  state.activityRow = null;
  state.deleted = [];
});

describe("POST /api/activities", () => {
  it("401s when signed out", async () => {
    state.signedIn = false;
    const res = await activitiesRoute.POST(json("/api/activities", "POST", {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: "Sign in required" } });
  });

  it("400s on a non-JSON body", async () => {
    const res = await activitiesRoute.POST(json("/api/activities", "POST", "{nope"));
    expect(res.status).toBe(400);
  });

  it("422s with per-field errors and never touches the database", async () => {
    const res = await activitiesRoute.POST(
      json("/api/activities", "POST", {
        id: randomUUID(),
        type: "strength",
        date: "2020-01-01",
        exercises: [{ exerciseId: randomUUID(), sets: [{ weightKg: 20 }] }],
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.fields).toHaveProperty(["exercises.0.sets.0.reps"]);
    expect(state.calls.filter((c) => c.kind === "rpc")).toEqual([]);
  });

  it("creates via save_activity and returns the stored activity", async () => {
    const id = randomUUID();
    state.rpc.save_activity = { data: id, error: null };
    state.activityRow = row(id);
    const res = await activitiesRoute.POST(
      json("/api/activities", "POST", {
        id,
        type: "running",
        date: "2020-01-01",
        durationSec: 1864,
        distanceM: 5200,
        notes: "  ",
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/api/activities/${id}`);
    expect((await res.json()).activity).toMatchObject({ id, startTime: "07:15", distanceM: 5200 });
    const rpc = state.calls.find((c) => c.name === "save_activity");
    expect(rpc?.args).toEqual({
      doc: {
        id,
        type: "running",
        date: "2020-01-01",
        startTime: null,
        durationSec: 1864,
        distanceM: 5200,
        avgHeartRate: null,
        feel: null,
        notes: null,
        templateId: null,
      },
      p_replace: false,
    });
  });

  it("maps a duplicate id to 409", async () => {
    state.rpc.save_activity = { data: null, error: { code: "23505", message: "dup" } };
    const res = await activitiesRoute.POST(
      json("/api/activities", "POST", { id: randomUUID(), type: "walking", date: "2020-01-01", durationSec: 600 }),
    );
    expect(res.status).toBe(409);
  });
});

describe("PUT /api/activities/:id", () => {
  it("replaces with p_replace = true and the URL id", async () => {
    const id = randomUUID();
    state.rpc.save_activity = { data: id, error: null };
    state.activityRow = row(id, { type: "walking" });
    const res = await activityRoute.PUT(
      json(`/api/activities/${id}`, "PUT", { type: "walking", date: "2020-01-01", durationSec: 600 }),
      ctx(id),
    );
    expect(res.status).toBe(200);
    const rpc = state.calls.find((c) => c.name === "save_activity");
    expect(rpc?.args).toMatchObject({ doc: { id }, p_replace: true });
  });

  it("rejects a body id that differs from the URL", async () => {
    const res = await activityRoute.PUT(
      json(`/api/activities/${randomUUID()}`, "PUT", { id: randomUUID(), type: "walking", date: "2020-01-01", durationSec: 600 }),
      ctx(randomUUID()),
    );
    expect(res.status).toBe(422);
  });

  it("404s when the activity is not yours or missing", async () => {
    state.rpc.save_activity = { data: null, error: { code: "P0002", message: "nf" } };
    const id = randomUUID();
    const res = await activityRoute.PUT(
      json(`/api/activities/${id}`, "PUT", { type: "walking", date: "2020-01-01", durationSec: 600 }),
      ctx(id),
    );
    expect(res.status).toBe(404);
  });

  it("404s on a malformed id without querying", async () => {
    const res = await activityRoute.GET(new Request("http://localhost/api/activities/x"), ctx("x"));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/activities/:id", () => {
  it("204s when a row was deleted", async () => {
    state.deleted = [{ id: "x" }];
    const res = await activityRoute.DELETE(new Request("http://localhost"), ctx(randomUUID()));
    expect(res.status).toBe(204);
  });
  it("404s when nothing was deleted (RLS hides other users' rows)", async () => {
    const res = await activityRoute.DELETE(new Request("http://localhost"), ctx(randomUUID()));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/activities", () => {
  it("400s without a valid range", async () => {
    const res = await activitiesRoute.GET(new NextRequest("http://localhost/api/activities?from=2026-11-01"));
    expect(res.status).toBe(400);
  });
  it("lists the range", async () => {
    state.activityRow = row(randomUUID());
    const res = await activitiesRoute.GET(
      new NextRequest("http://localhost/api/activities?from=2019-12-01&to=2020-01-31"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).activities).toHaveLength(1);
  });
});

describe("GET/POST /api/exercises", () => {
  it("passes validated filters to search_exercises", async () => {
    state.rpc.search_exercises = {
      data: [{ id: "e1", name: "Squat", tracking: "reps", owner_user_id: null, equipment: "barbell", primary_muscles: ["quadriceps"] }],
      error: null,
    };
    const res = await exercisesRoute.GET(
      new NextRequest("http://localhost/api/exercises?q=squt&muscle=quadriceps&equipment=&limit=10"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).exercises[0]).toEqual({
      id: "e1",
      name: "Squat",
      tracking: "reps",
      custom: false,
      equipment: "barbell",
      primaryMuscles: ["quadriceps"],
    });
    expect(state.calls.find((c) => c.name === "search_exercises")?.args).toEqual({
      q: "squt",
      muscle: "quadriceps",
      equipment_filter: null,
      max_rows: 10,
    });
  });

  it("400s on an unknown muscle", async () => {
    const res = await exercisesRoute.GET(new NextRequest("http://localhost/api/exercises?muscle=toes"));
    expect(res.status).toBe(400);
  });

  it("422s on an empty custom exercise name", async () => {
    const res = await exercisesRoute.POST(json("/api/exercises", "POST", { name: " " }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toHaveProperty("name");
  });
});

describe("mappers and error mapping", () => {
  it("orders exercises and sets and converts numeric weights", () => {
    const a = mapActivity(
      row("a", {
        type: "strength",
        start_time: null,
        activity_exercises: [
          {
            id: "ae2",
            position: 2,
            notes: null,
            exercise: { id: "p", name: "Plank", tracking: "time", owner_user_id: null },
            exercise_sets: [{ set_number: 1, reps: null, duration_sec: 60, weight_kg: null }],
          },
          {
            id: "ae1",
            position: 1,
            notes: null,
            exercise: { id: "s", name: "Mine", tracking: "reps", owner_user_id: "u" },
            exercise_sets: [
              { set_number: 2, reps: 8, duration_sec: null, weight_kg: "42.50" },
              { set_number: 1, reps: 8, duration_sec: null, weight_kg: 40 },
            ],
          },
        ],
      }),
    );
    expect(a.startTime).toBeNull();
    expect(a.exercises.map((e) => [e.exercise.name, e.exercise.custom])).toEqual([
      ["Mine", true],
      ["Plank", false],
    ]);
    expect(a.exercises[0]!.sets.map((s) => s.weightKg)).toEqual([40, 42.5]);
  });

  it("maps last sets or null", () => {
    expect(mapLastSets(null)).toBeNull();
    expect(mapLastSets({ activityId: "a", date: "2026-11-01", sets: [{ setNumber: 1, reps: 5, durationSec: null, weightKg: "20.00" }] }))
      .toEqual({ activityId: "a", date: "2026-11-01", sets: [{ setNumber: 1, reps: 5, durationSec: null, weightKg: 20 }] });
  });

  it("maps SQLSTATEs to statuses", () => {
    const status = (code: string) => dbErrorResponse({ code }, "test").status;
    expect(status("P0002")).toBe(404);
    expect(status("23503")).toBe(422);
    expect(status("23505")).toBe(409);
    expect(status("23514")).toBe(422);
    expect(status("42501")).toBe(401);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(status("XX000")).toBe(500);
    expect(spy).toHaveBeenCalledWith("[api] test failed", { code: "XX000" });
    spy.mockRestore();
  });
});
