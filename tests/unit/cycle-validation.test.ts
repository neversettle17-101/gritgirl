import { describe, expect, it } from "vitest";
import {
  dateRangeQuery,
  fieldErrors,
  onboardingBody,
  periodDaysPutBody,
  settingsPutBody,
} from "@/lib/validation/cycle";

const errors = (r: { success: boolean; error?: Parameters<typeof fieldErrors>[0] }) =>
  r.success ? {} : fieldErrors(r.error!);

describe("dateRangeQuery", () => {
  it("accepts a valid range and rejects bad ones without throwing", () => {
    expect(dateRangeQuery.safeParse({ from: "2026-11-01", to: "2026-11-30" }).success).toBe(true);
    expect(errors(dateRangeQuery.safeParse({ from: "2026-11-30", to: "2026-11-01" }))).toHaveProperty("to");
    expect(errors(dateRangeQuery.safeParse({ from: "2026-02-30", to: "2026-03-01" }))).toHaveProperty("from");
    expect(errors(dateRangeQuery.safeParse({ from: "x", to: "y" }))).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    expect(errors(dateRangeQuery.safeParse({ from: "2024-01-01", to: "2026-11-01" }))).toHaveProperty("to");
    expect(dateRangeQuery.safeParse({}).success).toBe(false);
  });
});

describe("periodDaysPutBody", () => {
  it("accepts set / clear / replace", () => {
    for (const b of [
      { action: "set", from: "2026-11-01", to: "2026-11-05" },
      { action: "set", from: "2026-11-01", to: "2026-11-05", flow: null, flows: { "2026-11-02": "heavy" } },
      { action: "clear", from: "2026-01-01", to: "2026-12-31" },
      { action: "replace", from: "2026-11-01", to: "2026-11-05", days: [{ date: "2026-11-01", flow: "light" }] },
      { action: "replace", from: "2026-11-01", to: "2026-11-05", days: [] },
    ]) {
      expect(periodDaysPutBody.safeParse(b).success, JSON.stringify(b)).toBe(true);
    }
  });

  it("rejects malformed bodies", () => {
    const bad = [
      { action: "toggle", from: "2026-11-01", to: "2026-11-01" },
      { action: "set", from: "2026-11-05", to: "2026-11-01" },
      { action: "set", from: "2026-11-01", to: "2026-12-15" }, // > 31 days of period
      { action: "set", from: "2026-11-01", to: "2026-11-02", flow: "torrential" },
      { action: "set", from: "2026-11-01", to: "2026-11-02", flows: { "2026-11-09": "light" } },
      { action: "clear", from: "2025-01-01", to: "2026-11-01" },
      { action: "replace", from: "2026-11-01", to: "2026-11-02", days: [{ date: "2026-11-03" }] },
      { action: "replace", from: "2026-11-01", to: "2026-11-02", days: [{ date: "2026-11-01" }, { date: "2026-11-01" }] },
      { action: "replace", from: "2026-11-01", to: "2026-11-02" },
      { action: "clear", from: "2026-11-01", to: "2026-11-02", extra: 1 },
    ];
    for (const b of bad) expect(periodDaysPutBody.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });
});

describe("settingsPutBody", () => {
  it("accepts partial updates and validates each field", () => {
    expect(settingsPutBody.safeParse({ weightUnit: "lb" }).success).toBe(true);
    expect(settingsPutBody.safeParse({ timezone: "Europe/London", cyclePredictionsOn: false }).success).toBe(true);
    expect(settingsPutBody.safeParse({ displayName: "  Asha  " }).data).toEqual({ displayName: "Asha" });
    expect(settingsPutBody.safeParse({}).success).toBe(false);
    expect(errors(settingsPutBody.safeParse({ weightUnit: "st" }))).toHaveProperty("weightUnit");
    expect(errors(settingsPutBody.safeParse({ timezone: "Mars/Base" }))).toHaveProperty("timezone");
    expect(errors(settingsPutBody.safeParse({ defaultCycleLen: 14 }))).toHaveProperty("defaultCycleLen");
    expect(errors(settingsPutBody.safeParse({ defaultPeriodLen: 15 }))).toHaveProperty("defaultPeriodLen");
    expect(errors(settingsPutBody.safeParse({ weekStartsOn: 7 }))).toHaveProperty("weekStartsOn");
    expect(errors(settingsPutBody.safeParse({ lastPeriodStart: "2026-02-31" }))).toHaveProperty("lastPeriodStart");
    expect(settingsPutBody.safeParse({ onboardedAt: "2026-01-01" }).success).toBe(false);
    expect(settingsPutBody.safeParse({ completeOnboarding: false }).success).toBe(false);
  });
});

describe("onboardingBody", () => {
  const ok = {
    displayName: "Asha",
    weightUnit: "kg",
    distanceUnit: "km",
    defaultCycleLen: 28,
    defaultPeriodLen: 5,
    cyclePredictionsOn: true,
  };
  it("requires a name and the cycle defaults; last period start is optional", () => {
    expect(onboardingBody.safeParse(ok).success).toBe(true);
    expect(onboardingBody.safeParse({ ...ok, lastPeriodStart: "2026-11-10", timezone: "Asia/Kolkata" }).success).toBe(true);
    expect(onboardingBody.safeParse({ ...ok, lastPeriodStart: null }).success).toBe(true);
    expect(errors(onboardingBody.safeParse({ ...ok, displayName: "   " }))).toHaveProperty("displayName");
    expect(errors(onboardingBody.safeParse({ ...ok, displayName: null }))).toHaveProperty("displayName");
  });
});
