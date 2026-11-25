import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareTemplates, mapTemplate, type TemplateRow, type UsageRow } from "@/lib/templates/mappers";
import { templateInputSchema } from "@/lib/validation/templates";

// /api/templates route handlers with a fake supabase client: status codes,
// the error body shape (§10), usage merging, and what reaches the database.
// The SQL behind save_template is covered by tests/db/template-functions.test.ts.

vi.mock("server-only", () => ({}));

const state: {
  signedIn: boolean;
  rpc: { name: string; args: unknown }[];
  rpcResult: { data: unknown; error: unknown };
  rows: TemplateRow[];
  usage: UsageRow[];
  filters: [string, unknown][];
  archivedIds: string[];
} = { signedIn: true, rpc: [], rpcResult: { data: null, error: null }, rows: [], usage: [], filters: [], archivedIds: [] };

function fakeQuery(table: string) {
  const q: Record<string, unknown> = {};
  let id: string | null = null;
  Object.assign(q, {
    select: () => q,
    in: () => q,
    eq: (col: string, v: unknown) => {
      state.filters.push([col, v]);
      if (col === "id") id = v as string;
      return q;
    },
    returns: async () => ({ data: table === "workout_template_usage" ? state.usage : state.rows, error: null }),
    maybeSingle: async () => ({ data: state.rows.find((r) => r.id === id) ?? null, error: null }),
    update: (patch: unknown) => {
      state.filters.push(["update", patch]);
      return {
        eq: (_c: string, v: string) => ({
          eq: () => ({
            select: async () => ({ data: state.archivedIds.includes(v) ? [{ id: v }] : [], error: null }),
          }),
        }),
      };
    },
  });
  return q;
}

const fakeSupabase = {
  from: (table: string) => fakeQuery(table),
  rpc: async (name: string, args: unknown) => {
    state.rpc.push({ name, args });
    return state.rpcResult;
  },
};

vi.mock("@/lib/api/session", () => ({
  getSession: async () => (state.signedIn ? { supabase: fakeSupabase, userId: "user-1" } : null),
}));

const listRoute = await import("@/app/api/templates/route");
const oneRoute = await import("@/app/api/templates/[id]/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const SQUAT = "22222222-2222-4222-8222-222222222222";

const row = (id: string, o: Partial<TemplateRow> = {}): TemplateRow => ({
  id,
  type: "running",
  name: "The 5K",
  notes: null,
  target_distance_m: 5000,
  target_duration_sec: 1800,
  archived: false,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  template_exercises: [],
  ...o,
});

beforeEach(() => {
  state.signedIn = true;
  state.rpc = [];
  state.rpcResult = { data: null, error: null };
  state.rows = [];
  state.usage = [];
  state.filters = [];
  state.archivedIds = [];
});

describe("mapTemplate / compareTemplates", () => {
  it("maps rows, sorts exercises by position and merges usage", () => {
    const t = mapTemplate(
      row("t1", {
        type: "strength",
        target_distance_m: null,
        target_duration_sec: null,
        template_exercises: [
          { id: "b", position: 2, target_sets: 2, target_reps: null, target_duration_sec: 60, target_weight_kg: null, exercise: { id: "p", name: "Plank", tracking: "time", owner_user_id: null } },
          { id: "a", position: 1, target_sets: 3, target_reps: 10, target_duration_sec: null, target_weight_kg: "42.50", exercise: { id: SQUAT, name: "Squat", tracking: "reps", owner_user_id: "me" } },
        ],
      }),
      { template_id: "t1", used_count: 12, last_used_on: "2026-11-24" },
    );
    expect(t.usedCount).toBe(12);
    expect(t.lastUsedOn).toBe("2026-11-24");
    expect(t.exercises.map((e) => [e.position, e.exercise.name, e.targetWeightKg, e.exercise.custom])).toEqual([
      [1, "Squat", 42.5, true],
      [2, "Plank", null, false],
    ]);
  });

  it("no usage row means used 0×", () => {
    expect(mapTemplate(row("t"))).toMatchObject({ usedCount: 0, lastUsedOn: null });
  });

  it("orders most used, then most recently used, then newest", () => {
    const a = mapTemplate(row("a"), { template_id: "a", used_count: 2, last_used_on: "2026-11-01" });
    const b = mapTemplate(row("b"), { template_id: "b", used_count: 5, last_used_on: "2026-10-01" });
    const c = mapTemplate(row("c"), { template_id: "c", used_count: 2, last_used_on: "2026-11-20" });
    const d = mapTemplate(row("d", { created_at: "2026-11-10T00:00:00Z" }));
    const e = mapTemplate(row("e"));
    expect([a, b, c, d, e].sort(compareTemplates).map((t) => t.id)).toEqual(["b", "c", "a", "d", "e"]);
  });
});

describe("template validation", () => {
  it("needs a name and, for strength, at least one exercise", () => {
    const r = templateInputSchema.safeParse({ id: randomUUID(), type: "strength", name: "  ", exercises: [] });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["name", "exercises"]));
  });

  it("rejects cardio fields on strength and exercises on cardio (strict)", () => {
    expect(
      templateInputSchema.safeParse({
        id: randomUUID(),
        type: "strength",
        name: "x",
        targetDistanceM: 5000,
        exercises: [{ exerciseId: SQUAT, targetSets: 3 }],
      }).success,
    ).toBe(false);
    expect(
      templateInputSchema.safeParse({ id: randomUUID(), type: "running", name: "x", exercises: [] }).success,
    ).toBe(false);
  });

  it("fills nulls and trims", () => {
    const r = templateInputSchema.parse({ id: randomUUID(), type: "walking", name: " Stroll " });
    expect(r).toMatchObject({ name: "Stroll", notes: null, targetDistanceM: null, targetDurationSec: null });
  });

  it("checks target ranges", () => {
    const r = templateInputSchema.safeParse({
      id: randomUUID(),
      type: "strength",
      name: "x",
      exercises: [{ exerciseId: SQUAT, targetSets: 0, targetReps: 501, targetWeightKg: 20.123 }],
    });
    expect(r.error!.issues.map((i) => i.path.join(".")).sort()).toEqual([
      "exercises.0.targetReps",
      "exercises.0.targetSets",
      "exercises.0.targetWeightKg",
    ]);
  });
});

describe("GET /api/templates", () => {
  it("401s when signed out", async () => {
    state.signedIn = false;
    const res = await listRoute.GET(new NextRequest("http://localhost/api/templates"));
    expect(res.status).toBe(401);
  });

  it("lists non-archived regulars with usage, most used first", async () => {
    state.rows = [row("a", { name: "Stroll" }), row("b")];
    state.usage = [{ template_id: "b", used_count: 12, last_used_on: "2026-11-24" }];
    const res = await listRoute.GET(new NextRequest("http://localhost/api/templates"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates.map((t: { id: string; usedCount: number }) => [t.id, t.usedCount])).toEqual([
      ["b", 12],
      ["a", 0],
    ]);
    expect(state.filters).toContainEqual(["archived", false]);
  });

  it("?archived=1 includes archived ones", async () => {
    await listRoute.GET(new NextRequest("http://localhost/api/templates?archived=1"));
    expect(state.filters).not.toContainEqual(["archived", false]);
  });
});

describe("POST /api/templates", () => {
  it("400s on a non-JSON body", async () => {
    const res = await listRoute.POST(json("/api/templates", "POST", "{nope"));
    expect(res.status).toBe(400);
  });

  it("422s with per-field errors and never touches the database", async () => {
    const res = await listRoute.POST(json("/api/templates", "POST", { id: randomUUID(), type: "running", name: "" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "validation_failed", fields: { name: "Give it a name" } });
    expect(state.rpc).toEqual([]);
  });

  it("creates via save_template and returns the stored regular", async () => {
    const id = randomUUID();
    state.rpcResult = { data: id, error: null };
    state.rows = [row(id)];
    const res = await listRoute.POST(
      json("/api/templates", "POST", { id, type: "running", name: " The 5K ", targetDistanceM: 5000, targetDurationSec: 1800 }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/api/templates/${id}`);
    expect((await res.json()).template).toMatchObject({ id, name: "The 5K", usedCount: 0 });
    expect(state.rpc).toEqual([
      {
        name: "save_template",
        args: {
          doc: { id, type: "running", name: "The 5K", notes: null, targetDistanceM: 5000, targetDurationSec: 1800 },
          p_replace: false,
        },
      },
    ]);
  });

  it("maps a duplicate id to 409 and an unknown exercise to 422", async () => {
    const doc = { id: randomUUID(), type: "strength", name: "x", exercises: [{ exerciseId: SQUAT, targetSets: 3 }] };
    state.rpcResult = { data: null, error: { code: "23505" } };
    expect((await listRoute.POST(json("/api/templates", "POST", doc))).status).toBe(409);
    state.rpcResult = { data: null, error: { code: "23503" } };
    expect((await listRoute.POST(json("/api/templates", "POST", doc))).status).toBe(422);
  });
});

describe("/api/templates/:id", () => {
  it("GET 404s on a bad id or a missing regular, and returns archived ones", async () => {
    expect((await oneRoute.GET(new Request("http://x"), ctx("nope"))).status).toBe(404);
    const id = randomUUID();
    const missing = await oneRoute.GET(new Request("http://x"), ctx(id));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.message).toBe("Regular not found");
    state.rows = [row(id, { archived: true })];
    const res = await oneRoute.GET(new Request("http://x"), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).template.archived).toBe(true);
  });

  it("PUT replaces with the URL id and rejects a mismatched body id", async () => {
    const id = randomUUID();
    const bad = await oneRoute.PUT(json(`/api/templates/${id}`, "PUT", { id: randomUUID(), type: "walking", name: "x" }), ctx(id));
    expect(bad.status).toBe(422);

    state.rpcResult = { data: id, error: null };
    state.rows = [row(id, { type: "walking", name: "Stroll" })];
    const res = await oneRoute.PUT(json(`/api/templates/${id}`, "PUT", { type: "walking", name: "Stroll" }), ctx(id));
    expect(res.status).toBe(200);
    expect(state.rpc[0]).toMatchObject({ name: "save_template", args: { doc: { id }, p_replace: true } });
  });

  it("PUT on an archived / unknown regular is 404", async () => {
    const id = randomUUID();
    state.rpcResult = { data: null, error: { code: "P0002" } };
    const res = await oneRoute.PUT(json(`/api/templates/${id}`, "PUT", { type: "walking", name: "x" }), ctx(id));
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe("Regular not found");
  });

  it("DELETE archives (204) and 404s when nothing was archived", async () => {
    const id = randomUUID();
    state.archivedIds = [id];
    const res = await oneRoute.DELETE(new Request("http://x"), ctx(id));
    expect(res.status).toBe(204);
    expect(state.filters).toContainEqual(["update", { archived: true }]);
    expect((await oneRoute.DELETE(new Request("http://x"), ctx(randomUUID()))).status).toBe(404);
  });
});
