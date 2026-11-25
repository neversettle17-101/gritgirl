/**
 * The run / walk order slip as plain data: typed strings in display units,
 * converted to the SI API document on save.
 */
import type { ActivityDetail } from "@/lib/domain/activity-types";
import {
  formatClock,
  fromMetres,
  parseDecimal,
  parseDuration,
  toMetres,
  type DistanceUnit,
} from "@/lib/domain/units";
import { LIMITS, type CardioActivityInput, type Feel } from "@/lib/validation/activities";

export interface CardioForm {
  id: string;
  type: "running" | "walking";
  date: string;
  startTime: string;
  /** "31:04", "45", "1:02:03"; bare numbers = minutes */
  duration: string;
  /** in distanceUnit, e.g. "5.2" */
  distance: string;
  avgHeartRate: string;
  feel: Feel | null;
  notes: string;
  templateId: string | null;
}

export function newCardioForm(o: {
  id: string;
  type: "running" | "walking";
  date: string;
  startTime?: string;
}): CardioForm {
  return {
    id: o.id,
    type: o.type,
    date: o.date,
    startTime: o.startTime ?? "",
    duration: "",
    distance: "",
    avgHeartRate: "",
    feel: null,
    notes: "",
    templateId: null,
  };
}

export function activityToCardioForm(a: ActivityDetail, unit: DistanceUnit): CardioForm {
  return {
    id: a.id,
    type: a.type === "walking" ? "walking" : "running",
    date: a.date,
    startTime: a.startTime ?? "",
    duration: a.durationSec ? formatClock(a.durationSec) : "",
    distance: a.distanceM ? String(Math.round(fromMetres(a.distanceM, unit) * 100) / 100) : "",
    avgHeartRate: a.avgHeartRate ? String(a.avgHeartRate) : "",
    feel: a.feel,
    notes: a.notes ?? "",
    templateId: a.templateId,
  };
}

/** The −/+ buttons: 0.1 steps, never below zero, no float noise. */
export function stepDistance(current: string, delta: number): string {
  const n = parseDecimal(current) ?? 0;
  const next = Math.max(0, Math.round((n + delta) * 10) / 10);
  return next === 0 ? "" : next.toFixed(1);
}

export type CardioResult =
  | { ok: true; payload: CardioActivityInput }
  | { ok: false; errors: Record<string, string> };

export function cardioFormToPayload(f: CardioForm, unit: DistanceUnit): CardioResult {
  const errors: Record<string, string> = {};

  const durationSec = parseDuration(f.duration, "minutes");
  if (!f.duration.trim()) errors.durationSec = "How long was it?";
  else if (durationSec === null || durationSec > LIMITS.durationSec.max)
    errors.durationSec = "Duration: like 31:04 or 1:02:03";

  let distanceM: number | null = null;
  if (f.distance.trim()) {
    const d = parseDecimal(f.distance);
    distanceM = d === null ? null : toMetres(d, unit);
    if (distanceM === null || distanceM < LIMITS.distanceM.min || distanceM > LIMITS.distanceM.max)
      errors.distanceM = `Distance: up to ${unit === "km" ? "200 km" : "124 mi"}`;
  }

  let avgHeartRate: number | null = null;
  if (f.avgHeartRate.trim()) {
    avgHeartRate = /^\d+$/.test(f.avgHeartRate.trim()) ? Number(f.avgHeartRate.trim()) : null;
    if (
      avgHeartRate === null ||
      avgHeartRate < LIMITS.avgHeartRate.min ||
      avgHeartRate > LIMITS.avgHeartRate.max
    )
      errors.avgHeartRate = `Heart rate: ${LIMITS.avgHeartRate.min}–${LIMITS.avgHeartRate.max} bpm`;
  }

  if (f.notes.length > LIMITS.notes) errors.notes = `Keep it under ${LIMITS.notes} characters`;

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      id: f.id,
      type: f.type,
      date: f.date,
      startTime: f.startTime || null,
      durationSec: durationSec!,
      distanceM,
      avgHeartRate,
      feel: f.feel,
      notes: f.notes.trim() || null,
      templateId: f.templateId,
    },
  };
}
