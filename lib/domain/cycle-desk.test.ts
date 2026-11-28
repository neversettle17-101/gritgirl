import { describe, expect, it } from "vitest";
import { currentPeriodDays, diffMarks, retypeDay, stripMonthLabel, weekDates } from "./cycle-desk";

describe("cycle desk helpers", () => {
  it("lays out a week", () => {
    expect(weekDates("2026-11-23")).toEqual([
      "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29",
    ]);
    expect(stripMonthLabel("2026-11-23")).toBe("NOV");
    expect(stripMonthLabel("2026-11-30")).toBe("NOV / DEC");
  });

  it("finds DAY 1 and DAY 2 of the latest period", () => {
    expect(currentPeriodDays([])).toEqual([null, null]);
    expect(currentPeriodDays(["2026-11-24"])).toEqual(["2026-11-24", null]);
    // An earlier period, then the current one (a one-day gap is bridged).
    expect(currentPeriodDays(["2026-10-27", "2026-10-28", "2026-11-26", "2026-11-24"])).toEqual([
      "2026-11-24",
      "2026-11-26",
    ]);
    expect(currentPeriodDays(new Set(["2026-11-24", "2026-11-25", "2026-11-26"]))).toEqual(["2026-11-24", "2026-11-25"]);
  });

  it("diffs saved against edited", () => {
    const saved = new Set(["2026-11-24", "2026-11-25"]);
    expect(diffMarks(saved, new Set(["2026-11-25", "2026-11-26"]))).toEqual({ add: ["2026-11-26"], remove: ["2026-11-24"] });
    expect(diffMarks(saved, saved)).toEqual({ add: [], remove: [] });
  });

  it("retypes a day", () => {
    const marked = new Set(["2026-11-24", "2026-11-25"]);
    expect([...retypeDay(marked, "2026-11-24", "2026-11-23", "2026-11-28")].sort()).toEqual(["2026-11-23", "2026-11-25"]);
    expect([...retypeDay(marked, "2026-11-24", "", "2026-11-28")]).toEqual(["2026-11-25"]);
    expect([...retypeDay(marked, null, "2026-11-30", "2026-11-28")].sort()).toEqual(["2026-11-24", "2026-11-25"]);
    expect(marked.size).toBe(2); // not mutated
  });
});
