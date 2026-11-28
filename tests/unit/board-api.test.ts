import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRow } from "@/lib/activities/mappers";
import { todayIn } from "@/lib/domain/dates";

// GET /api/board with a fake supabase client: status codes, the range sent to
// the database, week_starts_on, and the payload shape. Row isolation (RLS) is
// covered by tests/db/rls.test.ts.

vi.mock("server-only", () => ({}));

interface Query {
  table: string;
  select: string;
  gte?: string;
  lte?: string;
}

const state: {
  signedIn: boolean;
  weekStartsOn: number;
  rows: ActivityRow[];
  periodDays: string[];
  circleLedgers: boolean;
  queries: Query[];
  fail: boolean;
} = { signedIn: true, weekStartsOn: 1, rows: [], periodDays: [], circleLedgers: true, queries: [], fail: false };

function fakeQuery(table: string) {
  const q: Query = { table, select: "" };
  const api: Record<string, unknown> = {
    select: (s: string) => {
      q.select = s.trim();
      state.queries.push(q);
      return api;
    },
    gte: (_c: string, v: string) => ((q.gte = v), api),
    lte: (_c: string, v: string) => ((q.lte = v), api),
    order: () => api,
    // period_days is awaited straight after .order().
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      if (table !== "period_days") return reject(new Error(`unexpected await on ${table}`));
      if (state.fail) return resolve({ data: null, error: { code: "XX000", message: "boom" } });
      resolve({ data: state.periodDays.filter((d) => d >= q.gte! && d <= q.lte!).map((date) => ({ date })), error: null });
    },
    returns: async () => {
      if (state.fail) return { data: null, error: { code: "XX000", message: "boom" } };
      const rows = state.rows.filter((r) => r.date >= q.gte! && r.date <= q.lte!);
      return { data: q.select === "date" ? rows.map((r) => ({ date: r.date })) : rows, error: null };
    },
    maybeSingle: async () => ({
      data: {
        weight_unit: "kg",
        distance_unit: "km",
        timezone: "UTC",
        week_starts_on: state.weekStartsOn,
        cycle_circle_ledgers: state.circleLedgers,
        cycle_circle_progress: true,
      },
      error: null,
    }),
  };
  return api;
}

vi.mock("@/lib/api/session", () => ({
  getSession: async () => (state.signedIn ? { supabase: { from: fakeQuery }, userId: "user-1" } : null),
}));

const route = await import("@/app/api/board/route");
const get = (qs: string) => route.GET(new NextRequest(`http://localhost/api/board${qs}`));

let n = 0;
const row = (o: Partial<ActivityRow> & Pick<ActivityRow, "date">): ActivityRow => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  type: "running",
  start_time: null,
  duration_sec: 1800,
  notes: null,
  feel: null,
  distance_m: 5000,
  avg_heart_rate: null,
  template_id: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  activity_exercises: [],
  ...o,
});

beforeEach(() => {
  state.signedIn = true;
  state.weekStartsOn = 1;
  state.rows = [];
  state.periodDays = [];
  state.circleLedgers = true;
  state.queries = [];
  state.fail = false;
});

describe("GET /api/board", () => {
  it("401 when signed out", async () => {
    state.signedIn = false;
    const res = await get("?view=week&date=2026-11-25");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: "Sign in required" } });
  });

  it("400 for a bad view or date", async () => {
    for (const qs of ["?view=decade&date=2026-11-25", "?view=day&date=2026-02-30", "?view=day&date=today"]) {
      const res = await get(qs);
      expect(res.status, qs).toBe(400);
      expect((await res.json()).error.code).toBe("bad_request");
    }
  });

  it("week: Monday start, per-day minutes, totals, streak", async () => {
    state.rows = [
      row({ date: "2026-11-23", start_time: "07:15:00", duration_sec: 1860, distance_m: 5200, avg_heart_rate: 152 }),
      row({
        date: "2026-11-24",
        type: "strength",
        duration_sec: null,
        distance_m: null,
        activity_exercises: [
          {
            id: "ae-1",
            position: 0,
            notes: null,
            exercise: { id: "ex-1", name: "Plank", tracking: "time", owner_user_id: null },
            exercise_sets: [
              { set_number: 1, reps: null, duration_sec: 60, weight_kg: null },
              { set_number: 2, reps: null, duration_sec: 60, weight_kg: null },
            ],
          },
        ],
      }),
      row({ date: "2026-11-24", type: "walking", duration_sec: 600, distance_m: 1000 }),
      row({ date: "2026-11-30", duration_sec: 600 }), // next week
    ];
    const res = await get("?view=week&date=2026-11-25");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.range).toEqual({
      view: "week",
      date: "2026-11-25",
      start: "2026-11-23",
      end: "2026-11-29",
      from: "2026-11-23",
      to: "2026-11-29",
    });
    expect(body.days).toHaveLength(7);
    expect(body.days[0]).toMatchObject({
      date: "2026-11-23",
      minutesByType: { running: 31, walking: 0, strength: 0 },
      distanceM: { running: 5200, walking: 0 },
      activities: [{ type: "running", title: "RUN", startTime: "07:15", durationSec: 1860, avgHeartRate: 152 }],
    });
    expect(body.days[1]).toMatchObject({
      minutesByType: { running: 0, walking: 10, strength: 2 },
      minutes: 12,
    });
    expect(body.days[1].activities.find((a: { type: string }) => a.type === "strength")).toMatchObject({
      exerciseCount: 1,
      setCount: 2,
      durationSec: 120,
    });
    expect(body.totals).toEqual({
      activeDays: 2,
      minutes: 43,
      workouts: 3,
      runs: 1,
      walks: 1,
      strength: 1,
      distanceM: { running: 5200, walking: 1000 },
      volumeKg: 0, // timed sets only
    });
    expect(body.activities).toBeUndefined();

    // One range query and one streak-dates query, both on activities.
    const acts = state.queries.filter((q) => q.table === "activities");
    expect(acts.map((q) => [q.select === "date" ? "dates" : "range", q.gte, q.lte])).toEqual([
      ["range", "2026-11-23", "2026-11-29"],
      ["dates", expect.any(String), expect.any(String)],
    ]);
  });

  it("week start follows user_settings.week_starts_on", async () => {
    state.weekStartsOn = 0;
    const body = await (await get("?view=week&date=2026-11-25")).json();
    expect(body.range).toMatchObject({ start: "2026-11-22", end: "2026-11-28" });
  });

  it("month: padded to whole weeks, totals for the month only", async () => {
    state.rows = [row({ date: "2026-10-31" }), row({ date: "2026-11-01" }), row({ date: "2026-11-02", type: "walking" })];
    const body = await (await get("?view=month&date=2026-11-10")).json();
    expect(body.range).toMatchObject({ start: "2026-11-01", end: "2026-11-30", from: "2026-10-26", to: "2026-12-06" });
    expect(body.days).toHaveLength(42);
    expect(body.totals).toMatchObject({ workouts: 2, runs: 1, walks: 1, activeDays: 2 });
    expect(body.streaks.longest).toBe(2);
  });

  it("day: includes the full activities in time order, and the current streak", async () => {
    state.rows = [
      row({ date: "2026-11-24", start_time: "18:00:00", type: "walking" }),
      row({ date: "2026-11-24", start_time: "06:30:00" }),
      row({ date: "2026-11-23" }),
      row({ date: "2026-11-22" }),
    ];
    const body = await (await get("?view=day&date=2026-11-24")).json();
    expect(body.days).toHaveLength(1);
    expect(body.activities.map((a: { startTime: string }) => a.startTime)).toEqual(["06:30", "18:00"]);
    expect(body.activities[0].exercises).toEqual([]);
    expect(body.streaks).toEqual({ current: 3, longest: 1 });
  });

  it("week and month: period marks for the range, numbered from the period's start", async () => {
    state.periodDays = ["2026-11-20", "2026-11-21", "2026-11-23", "2026-11-24", "2026-12-20"];
    const week = await (await get("?view=week&date=2026-11-25")).json();
    // The period began on the 20th (read through the lookback), so Monday is DAY 4.
    expect(week.periodMarks).toEqual([
      { date: "2026-11-23", day: 4 },
      { date: "2026-11-24", day: 5 },
    ]);
    const pd = state.queries.find((q) => q.table === "period_days");
    expect(pd).toMatchObject({ select: "date", lte: "2026-11-29" });
    expect(pd!.gte! < "2026-11-20").toBe(true);

    const month = await (await get("?view=month&date=2026-11-10")).json();
    expect(month.periodMarks.map((m: { date: string }) => m.date)).toEqual(["2026-11-20", "2026-11-21", "2026-11-23", "2026-11-24"]);
  });

  it("period marks are empty when the ledger switch is off, and absent on day / year", async () => {
    state.periodDays = ["2026-11-24"];
    state.circleLedgers = false;
    expect((await (await get("?view=week&date=2026-11-25")).json()).periodMarks).toEqual([]);

    state.circleLedgers = true;
    state.queries = [];
    expect((await (await get("?view=day&date=2026-11-24")).json()).periodMarks).toBeUndefined();
    expect((await (await get("?view=year&date=2026-11-24")).json()).periodMarks).toBeUndefined();
    expect(state.queries.some((q) => q.table === "period_days")).toBe(false);
  });

  it("defaults to this week (today in the user's time zone)", async () => {
    const body = await (await get("")).json();
    expect(body.range.view).toBe("week");
    expect(body.range.date).toBe(todayIn("UTC"));
  });

  it("500 when the database fails", async () => {
    state.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const view of ["day", "week"]) {
      const res = await get(`?view=${view}&date=2026-11-24`);
      expect(res.status, view).toBe(500);
    }
  });
});
