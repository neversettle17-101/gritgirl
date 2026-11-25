/**
 * Types for the cycle & phase engine (see ./cycle.ts).
 *
 * All dates are LOCAL calendar dates as `YYYY-MM-DD` strings (the same shape
 * as the `date` column in `period_days`). They never carry a time or zone.
 *
 * Every phase / prediction produced from these types is an ESTIMATE, not
 * medical advice.
 */

/** Matches the `flow_level` enum on `period_days.flow`. */
export type FlowLevel = 'spotting' | 'light' | 'medium' | 'heavy';

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

/** One row of `period_days` (user_id omitted). */
export interface PeriodDayInput {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  flow?: FlowLevel | null;
}

/** Subset of `user_settings` the engine needs. */
export interface CycleSettings {
  /** `user_settings.default_cycle_len` (onboarding, default 28). */
  defaultCycleLen: number;
  /** `user_settings.default_period_len` (onboarding, default 5). */
  defaultPeriodLen: number;
  /** `user_settings.cycle_predictions_on`. */
  predictionsOn: boolean;
}

export interface CycleOptions {
  /**
   * Onboarding "last period start" (CYC-3). Used as the anchor of an
   * estimated cycle ONLY when no period days are logged at all; as soon as
   * anything is logged, the logs are the source of truth.
   */
  lastPeriodStart?: string | null;
  /**
   * The user's local "today". Optional. When given and the most recent logged
   * period ended today or yesterday (so it may still be in progress), the
   * period is extended with predicted menstrual days up to the average period
   * length instead of jumping straight to follicular.
   */
  today?: string | null;
}

export interface DateRange {
  /** Inclusive, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive, `YYYY-MM-DD`. */
  to: string;
}

export interface CycleDayInfo {
  /** Estimated phase, or null when unknown / predictions are off. */
  phase: CyclePhase | null;
  /** 1-based day within the cycle, or null when the day is in no known cycle. */
  cycleDay: number | null;
  /** True only for days the user actually logged as period days. */
  isPeriod: boolean;
  /** Logged flow for that day, if any. */
  flow: FlowLevel | null;
  /**
   * True when the phase comes from a projection rather than logged data
   * (every day after the last logged period, and the onboarding anchor cycle).
   */
  predicted: boolean;
}

/** Ordered (ascending date) map of `YYYY-MM-DD` → day info. */
export type CycleCalendar = Map<string, CycleDayInfo>;

/** A period reconstructed from logged days (1-day gaps bridged). */
export interface Period {
  start: string;
  /** Last logged day of the period (inclusive). */
  end: string;
  /** end − start + 1, bridged gap days included. */
  length: number;
}

export interface CycleStats {
  periods: Period[];
  /** Raw lengths between consecutive period starts (oldest → newest), unfiltered. */
  cycleLengths: number[];
  /** Mean of the last 6 cycle lengths within [15, 60], or the default. */
  avgCycleLen: number;
  /** Mean of the last 6 period lengths, or the default. */
  avgPeriodLen: number;
  /** True when avgCycleLen fell back to settings.defaultCycleLen. */
  cycleLenIsDefault: boolean;
  /** True when avgPeriodLen fell back to settings.defaultPeriodLen. */
  periodLenIsDefault: boolean;
  /** Length of the most recent completed cycle (raw, may be out of range). */
  lastCycleLen: number | null;
}

export interface CycleSummary {
  /** Always true: everything here is a calendar-based estimate. */
  isEstimate: true;
  today: string;
  /** Phase for today (null if unknown or predictions off). */
  phase: CyclePhase | null;
  /** "Day N" of the current cycle; null if no cycle is known. */
  cycleDay: number | null;
  /** "of ~M": rounded average cycle length used for projections. */
  expectedCycleLen: number;
  /** Start of the cycle today belongs to (logged or onboarding anchor). */
  currentCycleStart: string | null;
  /** Estimated next period start; null when unknown or predictions are off. */
  nextPeriodStart: string | null;
  /** Days from today to nextPeriodStart; negative when the period is late. */
  daysUntilNextPeriod: number | null;
  /** True when the estimated next period start is before today. */
  isLate: boolean;
  avgCycleLen: number;
  avgPeriodLen: number;
  cycleLenIsDefault: boolean;
  periodLenIsDefault: boolean;
  lastCycleLen: number | null;
}
