import { describe, expect, it } from "vitest";
import { periodDayLabel, periodMarks, periodMarksIn, periodReadWindow } from "./period-marks";

describe("periodMarks", () => {
  it("numbers consecutive days within one period", () => {
    expect(periodMarks(["2026-11-25", "2026-11-24"])).toEqual([
      { date: "2026-11-24", day: 1 },
      { date: "2026-11-25", day: 2 },
    ]);
  });

  it("bridges a single missing day", () => {
    expect(periodMarks(["2026-11-24", "2026-11-26"]).map((m) => m.day)).toEqual([1, 3]);
  });

  it("starts a new period after a longer gap", () => {
    expect(periodMarks(["2026-10-27", "2026-10-28", "2026-11-24"]).map((m) => m.day)).toEqual([1, 2, 1]);
  });

  it("ignores duplicates", () => {
    expect(periodMarks(["2026-11-24", "2026-11-24"])).toHaveLength(1);
  });
});

describe("periodMarksIn", () => {
  it("numbers from before the range but returns only days in it", () => {
    expect(periodMarksIn(["2026-11-29", "2026-11-30", "2026-12-01"], { from: "2026-12-01", to: "2026-12-31" })).toEqual([
      { date: "2026-12-01", day: 3 },
    ]);
  });
});

describe("helpers", () => {
  it("reads 15 days before the range", () => {
    expect(periodReadWindow({ from: "2026-12-01", to: "2026-12-31" })).toEqual({ from: "2026-11-16", to: "2026-12-31" });
  });
  it("labels a day", () => {
    expect(periodDayLabel({ day: 2 })).toBe("DAY 2");
  });
});
