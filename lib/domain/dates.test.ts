import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatReceiptDate, isIsoDate, timeIn, todayIn } from "./dates";

describe("dates", () => {
  // 2026-11-24 20:00 UTC = 2026-11-25 01:30 in Kolkata
  const now = new Date("2026-11-24T20:00:00Z");

  it("computes today in the user's time zone", () => {
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-11-25");
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-11-24");
    expect(timeIn("Asia/Kolkata", now)).toBe("01:30");
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(todayIn("Not/AZone", now)).toBe("2026-11-24");
  });
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-02-01")).toBe(false);
  });
  it("does calendar arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-24", "2026-11-25")).toBe(1);
    expect(daysBetween("2026-11-25", "2026-11-24")).toBe(-1);
  });
  it("formats receipt dates", () => {
    expect(formatReceiptDate("2026-11-28")).toBe("SAT 28 NOV");
  });
});
