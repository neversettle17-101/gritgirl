import { describe, expect, it } from "vitest";
import { formatPeriodSpans, marksByDate, periodSpans } from "./ledger-periods";
import { periodMarks } from "./period-marks";

const NOV = { from: "2026-11-01", to: "2026-11-30" };

describe("periodSpans", () => {
  it("is empty with no marks", () => {
    expect(periodSpans(undefined, NOV)).toEqual([]);
    expect(periodSpans([], NOV)).toEqual([]);
  });

  it("spans one period, bridged gap included", () => {
    expect(periodSpans(periodMarks(["2026-11-24", "2026-11-25", "2026-11-27"]), NOV)).toEqual([
      { from: "2026-11-24", to: "2026-11-27" },
    ]);
  });

  it("lists each period in the month", () => {
    const marks = periodMarks(["2026-11-01", "2026-11-02", "2026-11-28", "2026-11-29"]);
    expect(periodSpans(marks, NOV)).toEqual([
      { from: "2026-11-01", to: "2026-11-02" },
      { from: "2026-11-28", to: "2026-11-29" },
    ]);
  });

  it("clips to the range (padding days and a period running in from last month)", () => {
    const marks = periodMarks(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(marks.find((m) => m.date === "2026-11-01")?.day).toBe(3);
    expect(periodSpans(marks, NOV)).toEqual([{ from: "2026-11-01", to: "2026-11-02" }]);
  });
});

describe("formatPeriodSpans", () => {
  it("formats like the ledger's date spans", () => {
    expect(formatPeriodSpans([{ from: "2026-11-24", to: "2026-11-25" }])).toBe("24 – 25 NOV");
    expect(formatPeriodSpans([{ from: "2026-11-24", to: "2026-11-24" }])).toBe("24 NOV");
    expect(
      formatPeriodSpans([
        { from: "2026-11-01", to: "2026-11-02" },
        { from: "2026-11-28", to: "2026-11-29" },
      ]),
    ).toBe("1 – 2 NOV · 28 – 29 NOV");
    expect(formatPeriodSpans([])).toBe("");
  });
});

describe("marksByDate", () => {
  it("looks marks up by date", () => {
    const m = marksByDate(periodMarks(["2026-11-24", "2026-11-25"]));
    expect(m.get("2026-11-25")).toEqual({ date: "2026-11-25", day: 2 });
    expect(m.has("2026-11-26")).toBe(false);
    expect(marksByDate(undefined).size).toBe(0);
  });
});
