/**
 * Profile: about-you details and body weight. Pure functions shared by the
 * API validation, the profile page and the forms.
 *
 * Stored canonically in centimetres and kilograms. Body weight is shown in
 * the user's weight unit (kg / lb); height follows the length unit implied by
 * their distance unit (km → cm, mi → feet and inches).
 */
import { daysBetween } from "./dates";
import { fromKg, parseDecimal, toKg, type DistanceUnit, type WeightUnit } from "./units";

/** Sensible ranges, enforced by the API and (as hard limits) the database. */
export const PROFILE_LIMITS = {
  displayName: 60,
  heightCm: { min: 50, max: 272 },
  weightKg: { min: 20, max: 400 },
  /** earliest date of birth accepted */
  dobMin: "1900-01-01",
} as const;

export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** What the profile page shows and edits (GET /api/profile). */
export interface Profile {
  displayName: string | null;
  heightCm: number | null;
  dateOfBirth: string | null;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  weekStartsOn: WeekStartsOn;
}

export interface BodyWeightEntry {
  id: string;
  /** local calendar date, YYYY-MM-DD */
  measuredOn: string;
  weightKg: number;
}

export type HeightUnit = "cm" | "ftin";

export const heightUnitFor = (distance: DistanceUnit): HeightUnit => (distance === "mi" ? "ftin" : "cm");

export const CM_PER_INCH = 2.54;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 165 → { feet: 5, inches: 5 } (whole inches). */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

/** 5 ft 5 in → 165.1 cm (0.1 cm, as stored). */
export function feetInchesToCm(feet: number, inches: number): number {
  return round1((feet * 12 + inches) * CM_PER_INCH);
}

/** "165 CM", "5′ 5″", "—". */
export function formatHeight(cm: number | null | undefined, unit: HeightUnit): string {
  if (cm === null || cm === undefined) return "—";
  if (unit === "cm") return `${round1(cm)} CM`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}′ ${inches}″`;
}

/** Body weight for display, to 0.1 in the user's unit: 62.4 (kg) or 137.6 (lb). */
export function bodyWeightIn(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? round1(kg) : fromKg(kg, unit);
}

/** "62.4 KG", "—". */
export function formatBodyWeight(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg === null || kg === undefined) return "—";
  return `${bodyWeightIn(kg, unit).toFixed(1)} ${unit.toUpperCase()}`;
}

/** Whole years old on `today`. */
export function ageOn(dob: string, today: string): number {
  const [by, bm, bd] = dob.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Change since the previous entry, in the user's unit: "+0.4", "−1.2", "±0.0". */
export function formatWeightChange(latestKg: number, previousKg: number, unit: WeightUnit): string {
  const d = round1(bodyWeightIn(latestKg, unit) - bodyWeightIn(previousKg, unit));
  if (d === 0) return "±0.0";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`;
}

// ───────── forms (strings in, canonical values out) ─────────

export interface AboutForm {
  displayName: string;
  /** cm, or feet when the unit is ftin */
  heightMain: string;
  /** inches (ftin only) */
  heightInches: string;
  dateOfBirth: string;
}

export function heightToForm(cm: number | null, unit: HeightUnit): Pick<AboutForm, "heightMain" | "heightInches"> {
  if (cm === null) return { heightMain: "", heightInches: "" };
  if (unit === "cm") return { heightMain: String(round1(cm)), heightInches: "" };
  const { feet, inches } = cmToFeetInches(cm);
  return { heightMain: String(feet), heightInches: String(inches) };
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Height fields → cm (null when both are empty). */
export function parseHeight(main: string, inches: string, unit: HeightUnit): Parsed<number | null> {
  const { min, max } = PROFILE_LIMITS.heightCm;
  const range = unit === "cm" ? `between ${min} and ${max} cm` : `between ${formatHeight(min, "ftin")} and ${formatHeight(max, "ftin")}`;
  if (!main.trim() && !inches.trim()) return { ok: true, value: null };
  let cm: number;
  if (unit === "cm") {
    const n = parseDecimal(main);
    if (n === null) return { ok: false, error: "Enter your height in cm" };
    cm = round1(n);
  } else {
    const ft = main.trim() ? parseDecimal(main) : 0;
    const inch = inches.trim() ? parseDecimal(inches) : 0;
    if (ft === null || inch === null || inch >= 12) return { ok: false, error: "Enter feet and inches (0–11)" };
    cm = feetInchesToCm(ft, inch);
  }
  if (cm < min || cm > max) return { ok: false, error: `Height should be ${range}` };
  return { ok: true, value: cm };
}

/** A typed body weight → kg. */
export function parseBodyWeight(input: string, unit: WeightUnit): Parsed<number> {
  const n = parseDecimal(input);
  if (n === null) return { ok: false, error: `Enter your weight in ${unit}` };
  const kg = toKg(n, unit);
  const { min, max } = PROFILE_LIMITS.weightKg;
  if (kg < min || kg > max) {
    const lo = Math.ceil(bodyWeightIn(min, unit));
    const hi = Math.floor(bodyWeightIn(max, unit));
    return { ok: false, error: `Weight should be between ${lo} and ${hi} ${unit}` };
  }
  return { ok: true, value: kg };
}

/** An ISO date of birth is plausible: not before 1900 and not after today. */
export function dobProblem(dob: string, today: string): string | null {
  if (dob < PROFILE_LIMITS.dobMin) return "Use a date after 1900";
  if (daysBetween(dob, today) < 0) return "Date of birth can't be in the future";
  return null;
}
