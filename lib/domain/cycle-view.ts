/**
 * Small presentation helpers on top of the cycle engine (./cycle.ts), shared
 * by the API and the UI. Pure; no React.
 */
import { MAX_PERIOD_GAP_DAYS } from "./cycle";
import type { CycleCalendar, CyclePhase, FlowLevel } from "./cycle-types";
import { diffDays } from "./dates";

/** One day as drawn by <PhaseBand> and returned by GET /api/cycle/calendar. */
export interface PhaseBandDay {
  /** `YYYY-MM-DD` */
  date: string;
  /** Estimated phase, or null when unknown / predictions are off. */
  phase: CyclePhase | null;
  /** True only for days the user actually logged as period days. */
  isPeriod: boolean;
  /** True when the phase is a projection, not backed by logged data. */
  predicted: boolean;
}

export interface CycleCalendarDay extends PhaseBandDay {
  cycleDay: number | null;
  flow: FlowLevel | null;
}

/** Engine calendar (Map) → ascending array, ready for JSON and <PhaseBand>. */
export function calendarToDays(calendar: CycleCalendar): CycleCalendarDay[] {
  return [...calendar].map(([date, d]) => ({
    date,
    phase: d.phase,
    cycleDay: d.cycleDay,
    isPeriod: d.isPeriod,
    flow: d.flow,
    predicted: d.predicted,
  }));
}

export const PHASES: readonly CyclePhase[] = ["menstrual", "follicular", "ovulatory", "luteal"];

export const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: "Menstrual",
  follicular: "Follicular",
  ovulatory: "Ovulatory",
  luteal: "Luteal",
};

/** One-letter code printed on the band, so phase is never shown by colour alone. */
export const PHASE_CODE: Record<CyclePhase, string> = {
  menstrual: "M",
  follicular: "F",
  ovulatory: "O",
  luteal: "L",
};

export const FLOW_LABEL: Record<FlowLevel, string> = {
  spotting: "Spotting",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
};

/** Contiguous runs of logged period days (gaps of one day bridged, like the engine). */
export interface LoggedDay {
  date: string;
  flow: FlowLevel | null;
}

export interface LoggedPeriod {
  start: string;
  end: string;
  days: LoggedDay[];
}

export function groupPeriods(days: readonly LoggedDay[]): LoggedPeriod[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const out: LoggedPeriod[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && diffDays(last.end, d.date) <= MAX_PERIOD_GAP_DAYS + 1) {
      last.end = d.date;
      last.days.push(d);
    } else {
      out.push({ start: d.date, end: d.date, days: [d] });
    }
  }
  return out;
}
