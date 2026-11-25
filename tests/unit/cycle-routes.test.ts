import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CycleRepo } from "@/lib/cycle/service";
import { fakeCycleRepo } from "./support/fake-cycle-repo";

// Route handlers with the Supabase repo swapped for the in-memory fake.
let current: CycleRepo | null = null;
vi.mock("@/lib/cycle/server", async () => {
  const { ApiError } = await import("@/lib/cycle/service");
  return {
    requireCycleRepo: async () => {
      if (!current) throw new ApiError(401, "unauthorized", "Sign in required");
      return current;
    },
  };
});

const periodDays = await import("@/app/api/period-days/route");
const settings = await import("@/app/api/settings/route");
const summary = await import("@/app/api/cycle/summary/route");
const calendar = await import("@/app/api/cycle/calendar/route");

const url = (path: string) => `http://localhost${path}`;
const put = (path: string, body: unknown) =>
  new Request(url(path), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-25T04:30:00Z"), toFake: ["Date"] });
  current = fakeCycleRepo().repo;
});

describe("/api/period-days", () => {
  it("logs a period and reads it back", async () => {
    let res = await periodDays.PUT(put("/api/period-days", { action: "set", from: "2026-11-20", to: "2026-11-22", flow: "light" }));
    expect(res.status).toBe(200);
    expect((await res.json()).days).toHaveLength(3);

    res = await periodDays.GET(new Request(url("/api/period-days?from=2026-11-01&to=2026-11-30")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      days: [
        { date: "2026-11-20", flow: "light" },
        { date: "2026-11-21", flow: "light" },
        { date: "2026-11-22", flow: "light" },
      ],
    });
  });

  it("returns the error envelope for bad input", async () => {
    let res = await periodDays.GET(new Request(url("/api/period-days?from=2026-11-30&to=2026-11-01")));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "invalid_input", message: expect.any(String), fields: { to: expect.any(String) } },
    });

    res = await periodDays.PUT(put("/api/period-days", "{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_json");

    res = await periodDays.PUT(put("/api/period-days", { action: "set", from: "2026-12-01", to: "2026-12-02" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("future_date");
  });

  it("401s when signed out", async () => {
    current = null;
    const res = await periodDays.GET(new Request(url("/api/period-days?from=2026-11-01&to=2026-11-30")));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  it("hides unexpected errors behind a 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    current = { ...fakeCycleRepo().repo, listPeriodDays: () => Promise.reject(new Error("db down")) };
    const res = await periodDays.GET(new Request(url("/api/period-days?from=2026-11-01&to=2026-11-30")));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong" } });
    spy.mockRestore();
  });
});

describe("/api/settings", () => {
  it("reads and updates settings", async () => {
    let res = await settings.GET();
    expect((await res.json()).settings).toMatchObject({ weightUnit: "kg", onboarded: false });
    res = await settings.PUT(put("/api/settings", { weightUnit: "lb", completeOnboarding: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).settings).toMatchObject({ weightUnit: "lb", onboarded: true });
    res = await settings.PUT(put("/api/settings", { defaultCycleLen: 99 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toHaveProperty("defaultCycleLen");
  });
});

describe("/api/cycle/*", () => {
  it("summary reflects a newly logged period", async () => {
    let res = await summary.GET(new Request(url("/api/cycle/summary")));
    expect((await res.json()).summary).toMatchObject({ today: "2026-11-25", cycleDay: null, phase: null });

    await periodDays.PUT(put("/api/period-days", { action: "set", from: "2026-11-21", to: "2026-11-24" }));
    res = await summary.GET(new Request(url("/api/cycle/summary")));
    expect((await res.json()).summary).toMatchObject({
      cycleDay: 5,
      currentCycleStart: "2026-11-21",
      nextPeriodStart: "2026-12-19",
      isEstimate: true,
    });

    res = await summary.GET(new Request(url("/api/cycle/summary?today=bad")));
    expect(res.status).toBe(400);
  });

  it("calendar returns one entry per day", async () => {
    await periodDays.PUT(put("/api/period-days", { action: "set", from: "2026-11-21", to: "2026-11-24" }));
    const res = await calendar.GET(new Request(url("/api/cycle/calendar?from=2026-11-20&to=2026-11-26")));
    const { days } = await res.json();
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ date: "2026-11-20", phase: null, isPeriod: false });
    expect(days[1]).toMatchObject({ date: "2026-11-21", phase: "menstrual", isPeriod: true, predicted: false });
  });
});
