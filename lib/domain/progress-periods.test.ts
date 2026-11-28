import { describe, expect, it } from "vitest";
import { formatPeriodDates, periodCaption, periodHitDates, periodWeeks, placeTags, sessionRange, TAG_W } from "./progress-periods";

// 2026-11-23 is a Monday; 2026-11-22 a Sunday.
const s = (...dates: string[]) => dates.map((date) => ({ date }));
const m = (...dates: string[]) => dates.map((date, i) => ({ date, day: i + 1 }));

describe("sessionRange", () => {
  it("spans the earliest to the latest session, whatever the order", () => {
    expect(sessionRange(s("2026-11-24", "2026-10-27", "2026-11-03"))).toEqual({ from: "2026-10-27", to: "2026-11-24" });
  });

  it("is null with no sessions", () => {
    expect(sessionRange([])).toBeNull();
  });
});

describe("periodWeeks", () => {
  it("marks a week when one of its sessions fell on a period day", () => {
    const weeks = periodWeeks(s("2026-11-17", "2026-11-24", "2026-11-27"), m("2026-11-24", "2026-11-25"), 1);
    expect([...weeks.entries()]).toEqual([["2026-11-23", ["2026-11-24"]]]);
  });

  it("does not mark a week when the period days had no session", () => {
    expect(periodWeeks(s("2026-11-23", "2026-11-27"), m("2026-11-24", "2026-11-25", "2026-11-26"), 1).size).toBe(0);
  });

  it("is empty with no marks (the progress switch is off)", () => {
    expect(periodWeeks(s("2026-11-24"), [], 1).size).toBe(0);
  });

  it("keeps every hit date in a week, ascending and unique (two sessions on one day count once)", () => {
    const weeks = periodWeeks(s("2026-11-25", "2026-11-24", "2026-11-25"), m("2026-11-24", "2026-11-25"), 1);
    expect(weeks.get("2026-11-23")).toEqual(["2026-11-24", "2026-11-25"]);
  });

  it("buckets by the user's week start", () => {
    // Sunday 22 Nov: the week of Mon 16 Nov when weeks start Monday, its own week when they start Sunday.
    expect([...periodWeeks(s("2026-11-22"), m("2026-11-22"), 1).keys()]).toEqual(["2026-11-16"]);
    expect([...periodWeeks(s("2026-11-22"), m("2026-11-22"), 0).keys()]).toEqual(["2026-11-22"]);
  });

  it("lists several period weeks oldest first", () => {
    const weeks = periodWeeks(s("2026-11-24", "2026-10-27"), m("2026-10-27", "2026-11-24"), 1);
    expect([...weeks.keys()]).toEqual(["2026-10-26", "2026-11-23"]);
    expect(periodHitDates(weeks)).toEqual(["2026-10-27", "2026-11-24"]);
  });
});

describe("formatPeriodDates", () => {
  it("joins consecutive days into a span", () => {
    expect(formatPeriodDates(["2026-11-25", "2026-11-24"])).toBe("24 – 25 NOV");
  });

  it("shows a single day on its own", () => {
    expect(formatPeriodDates(["2026-11-28"])).toBe("28 NOV");
  });

  it("does not bridge a day without a session", () => {
    expect(formatPeriodDates(["2026-11-24", "2026-11-26"])).toBe("24 NOV, 26 NOV");
  });

  it("spans across a month end", () => {
    expect(formatPeriodDates(["2026-11-30", "2026-12-01"])).toBe("30 NOV – 1 DEC");
  });

  it("is empty with no dates", () => {
    expect(formatPeriodDates([])).toBe("");
  });
});

describe("periodCaption", () => {
  it("reads like the spec", () => {
    const weeks = periodWeeks(s("2026-10-27", "2026-11-24", "2026-11-25"), m("2026-10-27", "2026-11-24", "2026-11-25"), 1);
    expect(periodCaption(weeks)).toBe("BLOOD BANK DOWN · 27 OCT, 24 – 25 NOV");
  });

  it("is null when nothing is circled", () => {
    expect(periodCaption(new Map())).toBeNull();
  });
});

describe("placeTags", () => {
  const size = { width: 320, height: 130 };
  const c = (x: number, y: number) => ({ x, y, period: true });
  const plain = (x: number, y: number) => ({ x, y, period: false });

  it("puts the tag above the circle, roughly centred", () => {
    expect(placeTags([c(160, 80)], size)).toEqual([{ x: 114, y: 40 }]);
  });

  it("flips below when above would clip the top", () => {
    expect(placeTags([c(160, 20)], size)).toEqual([{ x: 114, y: 42 }]);
  });

  it("keeps the tag inside the chart's width", () => {
    expect(placeTags([c(10, 80)], size)[0]!.x).toBe(2);
    expect(placeTags([c(315, 80)], size)[0]!.x).toBe(320 - TAG_W - 2);
  });

  it("tags plain points with nothing", () => {
    expect(placeTags([plain(50, 80), c(160, 80)], size)[0]).toBeNull();
  });

  it("tags only the first of back-to-back circled weeks (one period)", () => {
    const tags = placeTags([c(50, 80), c(110, 80), plain(170, 80), c(230, 80)], size);
    expect(tags.map((t) => t !== null)).toEqual([true, false, false, true]);
  });

  it("moves a tag off a neighbouring point's dot and label", () => {
    // Above would cover the plain point at (130, 50); below is clear.
    expect(placeTags([plain(130, 50), c(170, 80)], size)[1]).toEqual({ x: 124, y: 102 });
  });

  it("moves a tag that would cover an earlier tag", () => {
    const [a, , b] = placeTags([c(200, 60), plain(250, 120), c(300, 50)], size);
    expect(a).toEqual({ x: 154, y: 20 });
    expect(b).toEqual({ x: 222, y: 72 }); // below its own circle
  });

  it("settles for the first position that fits when everything is crowded", () => {
    const tags = placeTags([plain(150, 40), c(170, 70), plain(190, 115)], size);
    expect(tags[1]).toEqual({ x: 124, y: 30 });
  });
});
