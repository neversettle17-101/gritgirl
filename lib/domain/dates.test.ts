import { describe, expect, it } from "vitest";
import { addDays, diffDays, eachDay, isIsoDate, isValidTimeZone, monthBounds, todayIn } from "./dates";

describe("calendar date helpers", () => {
  it("validates real calendar dates", () => {
    expect(isIsoDate("2026-11-25")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-01")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("does day arithmetic across month, year and DST boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // EU DST switch
    expect(diffDays("2026-11-01", "2026-11-25")).toBe(24);
    expect(diffDays("2026-11-25", "2026-11-01")).toBe(-24);
    expect(eachDay("2026-11-29", "2026-12-02")).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
    expect(eachDay("2026-11-02", "2026-11-01")).toEqual([]);
    expect(() => addDays("nope", 1)).toThrow(RangeError);
  });

  it("knows today in a time zone", () => {
    const now = new Date("2026-11-25T20:00:00Z");
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-11-26"); // 01:30 IST
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-11-25");
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("gives month bounds", () => {
    expect(monthBounds("2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("2028-02-01")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});
