import { describe, expect, it } from "vitest";
import {
  ageOn,
  bodyWeightIn,
  cmToFeetInches,
  dobProblem,
  feetInchesToCm,
  formatBodyWeight,
  formatHeight,
  formatWeightChange,
  heightToForm,
  heightUnitFor,
  parseBodyWeight,
  parseHeight,
} from "./profile";

describe("height", () => {
  it("follows the distance unit", () => {
    expect(heightUnitFor("km")).toBe("cm");
    expect(heightUnitFor("mi")).toBe("ftin");
  });

  it("converts cm ↔ feet and inches", () => {
    expect(cmToFeetInches(165)).toEqual({ feet: 5, inches: 5 });
    expect(cmToFeetInches(182.9)).toEqual({ feet: 6, inches: 0 }); // 72.0 in, not 5′ 12″
    expect(feetInchesToCm(5, 5)).toBe(165.1);
    expect(cmToFeetInches(feetInchesToCm(5, 11))).toEqual({ feet: 5, inches: 11 });
  });

  it("formats in the user's unit", () => {
    expect(formatHeight(165, "cm")).toBe("165 CM");
    expect(formatHeight(165.06, "cm")).toBe("165.1 CM");
    expect(formatHeight(165, "ftin")).toBe("5′ 5″");
    expect(formatHeight(null, "cm")).toBe("—");
  });

  it("parses the form fields", () => {
    expect(parseHeight("", "", "cm")).toEqual({ ok: true, value: null });
    expect(parseHeight("165,5", "", "cm")).toEqual({ ok: true, value: 165.5 });
    expect(parseHeight("5", "5", "ftin")).toEqual({ ok: true, value: 165.1 });
    expect(parseHeight("6", "", "ftin")).toEqual({ ok: true, value: 182.9 });
    expect(parseHeight("5", "12", "ftin")).toMatchObject({ ok: false });
    expect(parseHeight("tall", "", "cm")).toMatchObject({ ok: false });
    expect(parseHeight("30", "", "cm")).toMatchObject({ ok: false, error: "Height should be between 50 and 272 cm" });
    expect(parseHeight("9", "6", "ftin")).toMatchObject({ ok: false, error: expect.stringContaining("8′ 11″") });
  });

  it("round-trips through the form", () => {
    expect(heightToForm(165.1, "ftin")).toEqual({ heightMain: "5", heightInches: "5" });
    expect(heightToForm(165.1, "cm")).toEqual({ heightMain: "165.1", heightInches: "" });
    expect(heightToForm(null, "cm")).toEqual({ heightMain: "", heightInches: "" });
  });
});

describe("body weight", () => {
  it("shows to 0.1 in the user's unit", () => {
    expect(bodyWeightIn(62.44, "kg")).toBe(62.4);
    expect(formatBodyWeight(62.4, "kg")).toBe("62.4 KG");
    expect(formatBodyWeight(62.4, "lb")).toBe("137.6 LB");
    expect(formatBodyWeight(60, "kg")).toBe("60.0 KG");
    expect(formatBodyWeight(null, "kg")).toBe("—");
  });

  it("parses typed weight into kg and checks the range", () => {
    expect(parseBodyWeight("62.4", "kg")).toEqual({ ok: true, value: 62.4 });
    expect(parseBodyWeight("137.6", "lb")).toEqual({ ok: true, value: 62.41 });
    expect(parseBodyWeight("", "kg")).toMatchObject({ ok: false });
    expect(parseBodyWeight("12", "kg")).toEqual({ ok: false, error: "Weight should be between 20 and 400 kg" });
    expect(parseBodyWeight("900", "lb")).toEqual({ ok: false, error: "Weight should be between 45 and 881 lb" });
  });

  it("describes the change since the previous weigh-in", () => {
    expect(formatWeightChange(62.4, 62.0, "kg")).toBe("+0.4");
    expect(formatWeightChange(61, 62.2, "kg")).toBe("−1.2");
    expect(formatWeightChange(62, 62, "lb")).toBe("±0.0");
  });
});

describe("date of birth", () => {
  it("computes age in whole years", () => {
    expect(ageOn("1995-11-25", "2026-11-25")).toBe(31);
    expect(ageOn("1995-11-26", "2026-11-25")).toBe(30);
    expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
  });

  it("rejects the future and before 1900", () => {
    expect(dobProblem("1995-06-01", "2026-11-25")).toBeNull();
    expect(dobProblem("2026-11-26", "2026-11-25")).toMatch(/future/);
    expect(dobProblem("1899-12-31", "2026-11-25")).toMatch(/1900/);
  });
});
