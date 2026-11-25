/**
 * Units, pace and durations (technical design §6). Pure functions shared by
 * the API, the forms and the receipts.
 *
 * The database stores SI only: metres, seconds, kilograms. Everything here
 * converts at the edge, for display and input.
 */

export type DistanceUnit = "km" | "mi";
export type WeightUnit = "kg" | "lb";

export interface Units {
  distance: DistanceUnit;
  weight: WeightUnit;
}

export const DEFAULT_UNITS: Units = { distance: "km", weight: "kg" };

export const METRES_PER_KM = 1000;
export const METRES_PER_MILE = 1609.344;
export const KG_PER_LB = 0.45359237;

const metresPer = (unit: DistanceUnit) => (unit === "km" ? METRES_PER_KM : METRES_PER_MILE);

const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

// ───────── distance ─────────

/** User input (km or mi) → whole metres, as stored. */
export function toMetres(value: number, unit: DistanceUnit): number {
  return Math.round(value * metresPer(unit));
}

/** Stored metres → km or mi (unrounded). */
export function fromMetres(metres: number, unit: DistanceUnit): number {
  return metres / metresPer(unit);
}

/** "5.20" — distance in the user's unit with fixed decimals (default 2, per §6). */
export function formatDistance(metres: number, unit: DistanceUnit, decimals = 2): string {
  return fromMetres(metres, unit).toFixed(decimals);
}

// ───────── weight ─────────

/**
 * User input → kilograms, as stored (numeric(6,2), so 2 decimals).
 * kg input is kept as typed. lb input is converted and rounded to 0.01 kg,
 * which still shows back as the same lb value at 0.1 lb precision.
 */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === "kg" ? round(value, 2) : round(value * KG_PER_LB, 2);
}

/** Stored kg → the user's unit, rounded to 0.1 for display/editing. */
export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? round(kg, 2) : round(kg / KG_PER_LB, 1);
}

/** "40", "42.5", "BW" (null = bodyweight). */
export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg === null || kg === undefined) return "BW";
  return String(fromKg(kg, unit));
}

// ───────── pace ─────────

/**
 * Seconds per km (or mile): duration_sec / (distance_m / 1000). Null when the
 * distance or duration is missing, since pace is derived and never guessed.
 */
export function paceSecondsPer(
  durationSec: number | null | undefined,
  distanceM: number | null | undefined,
  unit: DistanceUnit,
): number | null {
  if (!durationSec || !distanceM || durationSec <= 0 || distanceM <= 0) return null;
  return durationSec / fromMetres(distanceM, unit);
}

/** "6:12 /km". "—" when pace cannot be derived. */
export function formatPace(
  durationSec: number | null | undefined,
  distanceM: number | null | undefined,
  unit: DistanceUnit,
): string {
  const pace = paceSecondsPer(durationSec, distanceM, unit);
  if (pace === null) return "—";
  const total = Math.round(pace);
  const min = Math.floor(total / 60);
  return `${min}:${String(total % 60).padStart(2, "0")} /${unit}`;
}

// ───────── durations ─────────

/**
 * Parses what people type for a duration.
 *   "31:04" → 1864 (mm:ss) · "1:02:03" → 3723 (h:mm:ss)
 *   "43" / "43 min" / "43m" → 2580 when bare numbers mean minutes
 *   "60" / "60s" → 60 when bare numbers mean seconds
 *   "1h 5m", "1h", "90s", "2m 30s"
 * Returns null for empty or unparseable input, or zero.
 */
export function parseDuration(input: string, bare: "minutes" | "seconds" = "minutes"): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) {
    const parts = s.split(":").map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return null;
    const sec = parts.reduce((acc, p) => acc * 60 + p, 0);
    return sec > 0 ? sec : null;
  }

  const bareMatch = /^(\d+(?:\.\d+)?)$/.exec(s);
  if (bareMatch) {
    const n = Number(bareMatch[1]);
    const sec = Math.round(bare === "minutes" ? n * 60 : n);
    return sec > 0 ? sec : null;
  }

  const unitRe = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)\b/g;
  let sec = 0;
  let consumed = "";
  for (const m of s.matchAll(unitRe)) {
    const n = Number(m[1]);
    const u = m[2]!;
    sec += u.startsWith("h") ? n * 3600 : u.startsWith("m") ? n * 60 : n;
    consumed += m[0];
  }
  if (!consumed || s.replace(unitRe, "").trim() !== "") return null;
  sec = Math.round(sec);
  return sec > 0 ? sec : null;
}

/** 1864 → "31:04", 3723 → "1:02:03". */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Receipt style: "31 MIN", "1 H 05 MIN", "—" when unknown. */
export function formatMinutes(totalSec: number | null | undefined): string {
  if (!totalSec || totalSec <= 0) return "—";
  const min = Math.round(totalSec / 60);
  if (min < 60) return `${min} MIN`;
  return `${Math.floor(min / 60)} H ${String(min % 60).padStart(2, "0")} MIN`;
}

/** Per-set time, compact: 45 → "45s", 90 → "1:30". */
export function formatSetTime(sec: number): string {
  return sec < 60 ? `${sec}s` : formatClock(sec);
}

/** Parses a decimal typed with either "." or "," (phones in many locales). */
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!s || !/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
