import { describe, expect, it } from "vitest";
import {
  ApiError,
  completeOnboarding,
  getCycleCalendar,
  getCycleSummary,
  getSettings,
  plannedDays,
  updateSettings,
  userToday,
  writePeriodDays,
} from "@/lib/cycle/service";
import { periodDaysPutBody } from "@/lib/validation/cycle";
import { fakeCycleRepo } from "./support/fake-cycle-repo";

// 2026-11-25 10:00 in Asia/Kolkata.
const NOW = new Date("2026-11-25T04:30:00Z");

const body = (b: unknown) => periodDaysPutBody.parse(b);

describe("settings", () => {
  it("404s when the settings row is missing", async () => {
    const { repo } = fakeCycleRepo({ settings: null });
    await expect(getSettings(repo)).rejects.toMatchObject({ status: 404 });
  });

  it("applies a partial update", async () => {
    const { repo } = fakeCycleRepo();
    const s = await updateSettings(repo, { weightUnit: "lb", weekStartsOn: 0 });
    expect(s).toMatchObject({ weightUnit: "lb", weekStartsOn: 0, distanceUnit: "km" });
  });

  it("sets onboarded_at once and never moves it", async () => {
    const fake = fakeCycleRepo();
    await completeOnboarding(
      fake.repo,
      {
        displayName: "Asha",
        weightUnit: "kg",
        distanceUnit: "km",
        defaultCycleLen: 30,
        defaultPeriodLen: 4,
        cyclePredictionsOn: false,
        lastPeriodStart: "2026-11-10",
      },
      NOW,
    );
    expect(fake.onboardedAt()).toBe(NOW.toISOString());
    expect(await getSettings(fake.repo)).toMatchObject({
      displayName: "Asha",
      defaultCycleLen: 30,
      defaultPeriodLen: 4,
      cyclePredictionsOn: false,
      lastPeriodStart: "2026-11-10",
      onboarded: true,
    });
    await updateSettings(fake.repo, { completeOnboarding: true }, new Date("2027-01-01"));
    expect(fake.onboardedAt()).toBe(NOW.toISOString());
  });

  it("falls back to UTC for a broken stored time zone", () => {
    expect(userToday({ timezone: "Asia/Kolkata" }, NOW)).toBe("2026-11-25");
    expect(userToday({ timezone: "Not/AZone" }, new Date("2026-11-25T23:30:00Z"))).toBe("2026-11-25");
  });
});

describe("period days", () => {
  it("plans set / clear / replace", () => {
    expect(
      plannedDays(body({ action: "set", from: "2026-11-01", to: "2026-11-03", flow: "light", flows: { "2026-11-01": "heavy", "2026-11-03": null } })),
    ).toEqual([
      { date: "2026-11-01", flow: "heavy" },
      { date: "2026-11-02", flow: "light" },
      { date: "2026-11-03", flow: null },
    ]);
    expect(plannedDays(body({ action: "clear", from: "2026-11-01", to: "2026-11-30" }))).toEqual([]);
    expect(
      plannedDays(body({ action: "replace", from: "2026-11-01", to: "2026-11-05", days: [{ date: "2026-11-02" }] })),
    ).toEqual([{ date: "2026-11-02", flow: null }]);
  });

  it("logs, edits and clears a period", async () => {
    const { repo, calls } = fakeCycleRepo();
    let days = await writePeriodDays(repo, body({ action: "set", from: "2026-11-20", to: "2026-11-24", flow: "medium" }), NOW);
    expect(days).toHaveLength(5);
    // Edit: shorten to 20–22 and change flow on day 1.
    days = await writePeriodDays(
      repo,
      body({
        action: "replace",
        from: "2026-11-20",
        to: "2026-11-24",
        days: [{ date: "2026-11-20", flow: "heavy" }, { date: "2026-11-21", flow: "medium" }, { date: "2026-11-22" }],
      }),
      NOW,
    );
    expect(days).toEqual([
      { date: "2026-11-20", flow: "heavy" },
      { date: "2026-11-21", flow: "medium" },
      { date: "2026-11-22", flow: null },
    ]);
    days = await writePeriodDays(repo, body({ action: "clear", from: "2026-11-01", to: "2026-11-30" }), NOW);
    expect(days).toEqual([]);
    expect(calls.replace).toHaveLength(3);
  });

  it("allows tomorrow (time-zone slack) but rejects later future days", async () => {
    const { repo, calls } = fakeCycleRepo();
    await writePeriodDays(repo, body({ action: "set", from: "2026-11-25", to: "2026-11-26" }), NOW);
    const err = await writePeriodDays(repo, body({ action: "set", from: "2026-11-25", to: "2026-11-27" }), NOW).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "future_date" });
    expect(calls.replace).toHaveLength(1);
    // Clearing a future range is always fine.
    await writePeriodDays(repo, body({ action: "clear", from: "2026-11-01", to: "2026-12-31" }), NOW);
  });
});

describe("cycle summary and calendar", () => {
  const logged = [
    { date: "2026-10-01", flow: "heavy" as const },
    { date: "2026-10-02", flow: "medium" as const },
    { date: "2026-10-03", flow: "light" as const },
    { date: "2026-10-04", flow: "light" as const },
    { date: "2026-10-29", flow: "heavy" as const },
    { date: "2026-10-30", flow: "medium" as const },
    { date: "2026-10-31", flow: "light" as const },
    { date: "2026-11-01", flow: "spotting" as const },
  ];

  it("summarises the current cycle from the logs", async () => {
    const { repo } = fakeCycleRepo({ days: logged });
    const s = await getCycleSummary(repo, { now: NOW });
    expect(s).toMatchObject({
      isEstimate: true,
      today: "2026-11-25",
      cycleDay: 28,
      currentCycleStart: "2026-10-29",
      avgCycleLen: 28,
      avgPeriodLen: 4,
      nextPeriodStart: "2026-11-26",
      daysUntilNextPeriod: 1,
      phase: "luteal",
      predictionsOn: true,
    });
  });

  it("uses the onboarding anchor until something is logged", async () => {
    const { repo } = fakeCycleRepo({ settings: { lastPeriodStart: "2026-11-20", defaultCycleLen: 30 } });
    const s = await getCycleSummary(repo, { today: "2026-11-25" });
    expect(s).toMatchObject({ cycleDay: 6, nextPeriodStart: "2026-12-20", expectedCycleLen: 30 });
  });

  it("track-only mode gives no phase predictions", async () => {
    const { repo } = fakeCycleRepo({ settings: { cyclePredictionsOn: false }, days: logged });
    const s = await getCycleSummary(repo, { now: NOW });
    expect(s).toMatchObject({ phase: null, nextPeriodStart: null, predictionsOn: false });
    const cal = await getCycleCalendar(repo, { from: "2026-11-24", to: "2026-11-30" }, { now: NOW });
    expect(cal.every((d) => d.phase === null && !d.predicted)).toBe(true);
  });

  it("returns a calendar with logged vs predicted days", async () => {
    const { repo } = fakeCycleRepo({ days: logged });
    const cal = await getCycleCalendar(repo, { from: "2026-10-29", to: "2026-11-28" }, { now: NOW });
    expect(cal).toHaveLength(31);
    expect(cal[0]).toEqual({
      date: "2026-10-29",
      phase: "menstrual",
      cycleDay: 1,
      isPeriod: true,
      flow: "heavy",
      predicted: false,
    });
    const nextStart = cal.find((d) => d.date === "2026-11-26")!;
    expect(nextStart).toMatchObject({ phase: "menstrual", isPeriod: false, predicted: true, cycleDay: 1 });
  });
});
