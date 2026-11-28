import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkPeriodDaysAdd, checkPeriodRange, cycleMarkPrefsPatchSchema } from "@/lib/validation/cycle";

// /api/period-days, /api/period-days/:date and /api/cycle/prefs with a fake
// supabase client: validation, status codes, idempotent writes on
// (user, date), and that nothing about the body is logged. RLS on
// period_days: tests/db/rls.test.ts.

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; arg?: unknown; opts?: unknown };

const state = {
  signedIn: true,
  settings: { timezone: "UTC", cycle_circle_ledgers: true, cycle_circle_progress: true } as Record<string, unknown>,
  periodDates: [] as string[],
  calls: [] as Call[],
  dbError: null as null | { code: string },
};

function fakeQuery(table: string) {
  const q: Record<string, unknown> = {};
  const record = (op: string, arg?: unknown, opts?: unknown) => state.calls.push({ table, op, arg, opts });
  const result = () => ({ data: state.dbError ? null : table === "period_days" ? state.periodDates.map((date) => ({ date })) : [], error: state.dbError });
  Object.assign(q, {
    select: (cols?: string) => {
      record("select", cols);
      return q;
    },
    eq: (col: string, v: unknown) => {
      record("eq", [col, v]);
      return q;
    },
    gte: (col: string, v: unknown) => {
      record("gte", [col, v]);
      return q;
    },
    lte: (col: string, v: unknown) => {
      record("lte", [col, v]);
      return q;
    },
    order: () => q,
    update: (row: Record<string, unknown>) => {
      record("update", row);
      Object.assign(state.settings, row);
      return q;
    },
    upsert: (rows: unknown, opts: unknown) => {
      record("upsert", rows, opts);
      return q;
    },
    delete: () => {
      record("delete");
      return q;
    },
    maybeSingle: async () => ({ data: state.dbError ? null : state.settings, error: state.dbError }),
    then: (resolve: (v: unknown) => void) => resolve(result()),
  });
  return q;
}

vi.mock("@/lib/api/session", () => ({
  getSession: async () =>
    state.signedIn ? { supabase: { from: (t: string) => fakeQuery(t) }, userId: "user-1" } : null,
}));

const daysRoute = await import("@/app/api/period-days/route");
const dayRoute = await import("@/app/api/period-days/[date]/route");
const prefsRoute = await import("@/app/api/cycle/prefs/route");

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    headers: { "content-type": "application/json" },
  });
const ctx = (date: string) => ({ params: Promise.resolve({ date }) });

const TODAY = new Date().toISOString().slice(0, 10); // settings timezone is UTC

beforeEach(() => {
  state.signedIn = true;
  state.settings = { timezone: "UTC", cycle_circle_ledgers: true, cycle_circle_progress: true };
  state.periodDates = [];
  state.calls = [];
  state.dbError = null;
});

describe("validation", () => {
  it("checks the read range", () => {
    expect(checkPeriodRange({ from: "2026-11-01", to: "2026-11-30" })).toEqual({ ok: true, data: { from: "2026-11-01", to: "2026-11-30" } });
    expect(checkPeriodRange({ from: "2026-11-30", to: "2026-11-01" })).toMatchObject({ ok: false, fields: { to: expect.any(String) } });
    expect(checkPeriodRange({ from: "2025-01-01", to: "2026-11-30" })).toMatchObject({ ok: false, fields: { to: expect.stringMatching(/366/) } });
    expect(checkPeriodRange({ from: "2026-02-30", to: "2026-03-01" })).toMatchObject({ ok: false, fields: { from: expect.any(String) } });
    expect(checkPeriodRange({ to: "2026-03-01" })).toMatchObject({ ok: false });
  });

  it("de-duplicates and sorts the days to add", () => {
    expect(checkPeriodDaysAdd({ dates: ["2026-11-25", "2026-11-24", "2026-11-25"] }, "2026-11-28")).toEqual({
      ok: true,
      data: ["2026-11-24", "2026-11-25"],
    });
  });

  it("rejects future, ancient, malformed and oversized adds", () => {
    const bad = (body: unknown) => checkPeriodDaysAdd(body, "2026-11-28");
    expect(bad({ dates: ["2026-11-29"] })).toEqual({ ok: false, fields: { dates: "That day hasn't happened yet" } });
    expect(bad({ dates: ["1899-12-31"] })).toMatchObject({ ok: false, fields: { dates: expect.any(String) } });
    expect(bad({ dates: ["24 NOV"] })).toMatchObject({ ok: false, fields: { "dates.0": expect.any(String) } });
    expect(bad({ dates: [] })).toMatchObject({ ok: false });
    expect(bad({ dates: Array.from({ length: 32 }, (_, i) => `2026-10-${String((i % 28) + 1).padStart(2, "0")}`) })).toMatchObject({ ok: false });
    expect(bad({ dates: ["2026-11-24"], flow: "heavy" })).toMatchObject({ ok: false }); // strict
    expect(bad("2026-11-24")).toMatchObject({ ok: false });
  });

  it("checks the switches", () => {
    expect(cycleMarkPrefsPatchSchema.safeParse({ circleLedgers: false }).success).toBe(true);
    expect(cycleMarkPrefsPatchSchema.safeParse({}).success).toBe(true);
    expect(cycleMarkPrefsPatchSchema.safeParse({ circleLedgers: "no" }).success).toBe(false);
    expect(cycleMarkPrefsPatchSchema.safeParse({ remindMe: true }).success).toBe(false);
  });
});

describe("/api/period-days", () => {
  it("401s when signed out", async () => {
    state.signedIn = false;
    expect((await daysRoute.GET(req("/api/period-days?from=2026-11-01&to=2026-11-30", "GET"))).status).toBe(401);
    expect((await daysRoute.POST(req("/api/period-days", "POST", { dates: ["2026-11-24"] }))).status).toBe(401);
    expect((await dayRoute.DELETE(req("/api/period-days/2026-11-24", "DELETE"), ctx("2026-11-24"))).status).toBe(401);
  });

  it("GET lists the days in range", async () => {
    state.periodDates = ["2026-11-24", "2026-11-25"];
    const res = await daysRoute.GET(req("/api/period-days?from=2026-11-01&to=2026-11-30", "GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dates: ["2026-11-24", "2026-11-25"] });
    expect(state.calls).toContainEqual({ table: "period_days", op: "gte", arg: ["date", "2026-11-01"], opts: undefined });
    expect(state.calls).toContainEqual({ table: "period_days", op: "lte", arg: ["date", "2026-11-30"], opts: undefined });
  });

  it("GET 400s on a bad range", async () => {
    expect((await daysRoute.GET(req("/api/period-days?from=2026-11-30", "GET"))).status).toBe(400);
    expect((await daysRoute.GET(req("/api/period-days?from=2026-11-30&to=2026-11-01", "GET"))).status).toBe(400);
    expect(state.calls.some((c) => c.table === "period_days")).toBe(false);
  });

  it("POST upserts on (user, date) without touching existing rows", async () => {
    const res = await daysRoute.POST(req("/api/period-days", "POST", { dates: [TODAY, TODAY] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dates: [TODAY] });
    const up = state.calls.find((c) => c.op === "upsert")!;
    expect(up.table).toBe("period_days");
    expect(up.arg).toEqual([{ user_id: "user-1", date: TODAY }]);
    expect(up.opts).toEqual({ onConflict: "user_id,date", ignoreDuplicates: true });
  });

  it("POST validates and writes nothing on failure", async () => {
    const res = await daysRoute.POST(req("/api/period-days", "POST", { dates: ["2999-01-01"] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatchObject({ code: "validation_failed", fields: { dates: expect.any(String) } });
    expect((await daysRoute.POST(req("/api/period-days", "POST", "{"))).status).toBe(400);
    expect((await daysRoute.POST(req("/api/period-days", "POST", ["2026-11-24"]))).status).toBe(400);
    expect(state.calls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("DELETE is idempotent and scoped to me", async () => {
    const res = await dayRoute.DELETE(req("/api/period-days/2026-11-24", "DELETE"), ctx("2026-11-24"));
    expect(res.status).toBe(204);
    expect(state.calls).toContainEqual({ table: "period_days", op: "delete", arg: undefined, opts: undefined });
    expect(state.calls).toContainEqual({ table: "period_days", op: "eq", arg: ["user_id", "user-1"], opts: undefined });
    expect(state.calls).toContainEqual({ table: "period_days", op: "eq", arg: ["date", "2026-11-24"], opts: undefined });
    // Again: still 204.
    expect((await dayRoute.DELETE(req("/api/period-days/2026-11-24", "DELETE"), ctx("2026-11-24"))).status).toBe(204);
  });

  it("DELETE 404s on a malformed date", async () => {
    expect((await dayRoute.DELETE(req("/api/period-days/nope", "DELETE"), ctx("nope"))).status).toBe(404);
    expect((await dayRoute.DELETE(req("/api/period-days/2026-02-30", "DELETE"), ctx("2026-02-30"))).status).toBe(404);
    expect(state.calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("maps database errors and never logs the body", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.dbError = { code: "XX000" };
    const res = await daysRoute.GET(req("/api/period-days?from=2026-11-01&to=2026-11-30", "GET"));
    expect(res.status).toBe(500);
    state.dbError = { code: "42501" };
    expect((await dayRoute.DELETE(req("/api/period-days/2026-11-24", "DELETE"), ctx("2026-11-24"))).status).toBe(401);
    for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toMatch(/2026-11/);
    spy.mockRestore();
  });
});

describe("/api/cycle/prefs", () => {
  it("401s when signed out", async () => {
    state.signedIn = false;
    expect((await prefsRoute.GET()).status).toBe(401);
    expect((await prefsRoute.PATCH(req("/api/cycle/prefs", "PATCH", { circleLedgers: false }))).status).toBe(401);
  });

  it("GET returns both switches", async () => {
    state.settings.cycle_circle_progress = false;
    expect(await (await prefsRoute.GET()).json()).toEqual({ prefs: { circleLedgers: true, circleProgress: false } });
  });

  it("PATCH writes only the given switch, scoped to me", async () => {
    const res = await prefsRoute.PATCH(req("/api/cycle/prefs", "PATCH", { circleLedgers: false }));
    expect(res.status).toBe(200);
    expect(state.calls.find((c) => c.op === "update")!.arg).toEqual({ cycle_circle_ledgers: false });
    expect(state.calls).toContainEqual({ table: "user_settings", op: "eq", arg: ["user_id", "user-1"], opts: undefined });
    expect(await res.json()).toEqual({ prefs: { circleLedgers: false, circleProgress: true } });
  });

  it("PATCH validates", async () => {
    expect((await prefsRoute.PATCH(req("/api/cycle/prefs", "PATCH", { circleLedgers: "yes" }))).status).toBe(422);
    expect((await prefsRoute.PATCH(req("/api/cycle/prefs", "PATCH", { remindMe: true }))).status).toBe(422);
    expect((await prefsRoute.PATCH(req("/api/cycle/prefs", "PATCH", [true]))).status).toBe(400);
    expect(state.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("an empty PATCH just reads", async () => {
    const res = await prefsRoute.PATCH(req("/api/cycle/prefs", "PATCH", {}));
    expect(res.status).toBe(200);
    expect(state.calls.some((c) => c.op === "update")).toBe(false);
  });
});
