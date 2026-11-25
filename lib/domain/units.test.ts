import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDistance,
  formatMinutes,
  formatPace,
  formatSetTime,
  formatWeight,
  fromKg,
  fromMetres,
  paceSecondsPer,
  parseDecimal,
  parseDuration,
  toKg,
  toMetres,
} from "./units";

describe("distance", () => {
  it("stores whole metres", () => {
    expect(toMetres(5.2, "km")).toBe(5200);
    expect(toMetres(3.1, "mi")).toBe(4989);
    expect(toMetres(1, "mi")).toBe(1609);
  });
  it("displays in the user's unit with 2 decimals", () => {
    expect(formatDistance(5200, "km")).toBe("5.20");
    expect(formatDistance(1609, "mi")).toBe("1.00");
    expect(fromMetres(10000, "km")).toBe(10);
  });
});

describe("weight", () => {
  it("keeps kg as typed (2 decimals)", () => {
    expect(toKg(42.5, "kg")).toBe(42.5);
    expect(toKg(42.123, "kg")).toBe(42.12);
  });
  it("converts lb to kg and back without drift", () => {
    expect(toKg(45, "lb")).toBe(20.41);
    expect(fromKg(toKg(45, "lb"), "lb")).toBe(45);
    for (const lb of [2.5, 10, 95, 135, 225, 315.5]) {
      expect(fromKg(toKg(lb, "lb"), "lb")).toBe(lb);
    }
  });
  it("formats bodyweight as BW", () => {
    expect(formatWeight(null, "kg")).toBe("BW");
    expect(formatWeight(40, "kg")).toBe("40");
    expect(formatWeight(20.41, "lb")).toBe("45");
  });
});

describe("pace", () => {
  it("is duration / distance in km", () => {
    // 31:04 for 5.2 km → 358.46 s/km → 5:58 /km
    expect(paceSecondsPer(1864, 5200, "km")).toBeCloseTo(358.46, 1);
    expect(formatPace(1864, 5200, "km")).toBe("5:58 /km");
    expect(formatPace(1860, 5000, "km")).toBe("6:12 /km");
  });
  it("supports miles", () => {
    expect(formatPace(600, 1609, "mi")).toBe("10:00 /mi");
  });
  it("is unknown without distance or duration", () => {
    expect(paceSecondsPer(1800, null, "km")).toBeNull();
    expect(paceSecondsPer(null, 5000, "km")).toBeNull();
    expect(formatPace(1800, 0, "km")).toBe("—");
  });
  it("never shows :60 seconds", () => {
    // 359.6 s/km rounds to 360 → 6:00
    expect(formatPace(1798, 5000, "km")).toBe("6:00 /km");
  });
});

describe("parseDuration", () => {
  it("reads clock formats", () => {
    expect(parseDuration("31:04")).toBe(1864);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("0:45", "seconds")).toBe(45);
  });
  it("treats bare numbers as minutes or seconds", () => {
    expect(parseDuration("43")).toBe(2580);
    expect(parseDuration("60", "seconds")).toBe(60);
    expect(parseDuration("1.5")).toBe(90);
  });
  it("reads unit suffixes", () => {
    expect(parseDuration("43 min")).toBe(2580);
    expect(parseDuration("43 MIN")).toBe(2580);
    expect(parseDuration("1h 5m")).toBe(3900);
    expect(parseDuration("90s", "minutes")).toBe(90);
    expect(parseDuration("2m 30s")).toBe(150);
  });
  it("rejects junk, zero and out-of-range clock parts", () => {
    for (const s of ["", "  ", "abc", "12:61", "1:60:00", "0", "0:00", "5 apples", "-3"]) {
      expect(parseDuration(s), s).toBeNull();
    }
  });
});

describe("formatting", () => {
  it("formats clock times", () => {
    expect(formatClock(1864)).toBe("31:04");
    expect(formatClock(3723)).toBe("1:02:03");
    expect(formatClock(59)).toBe("0:59");
  });
  it("formats receipt minutes", () => {
    expect(formatMinutes(1864)).toBe("31 MIN");
    expect(formatMinutes(3900)).toBe("1 H 05 MIN");
    expect(formatMinutes(null)).toBe("—");
  });
  it("formats set times", () => {
    expect(formatSetTime(45)).toBe("45s");
    expect(formatSetTime(90)).toBe("1:30");
  });
  it("parses decimals with comma or dot", () => {
    expect(parseDecimal("5,2")).toBe(5.2);
    expect(parseDecimal("5.25")).toBe(5.25);
    expect(parseDecimal(".5")).toBe(0.5);
    expect(parseDecimal("5.")).toBe(5);
    expect(parseDecimal("5.2.1")).toBeNull();
    expect(parseDecimal("-1")).toBeNull();
    expect(parseDecimal("")).toBeNull();
  });
});
