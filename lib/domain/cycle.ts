/**
 * Cycle & phase engine: Grit Girl V0 (technical design §9, PRD §4.3).
 *
 * Pure, framework-free and storage-free: everything is recomputed from the
 * logged `period_days` on every call, so editing or deleting a past period
 * re-derives every phase immediately (CYC-8). Nothing here is persisted.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ ALL OUTPUTS ARE CALENDAR-BASED ESTIMATES, NOT MEDICAL ADVICE.        │
 * │ The UI must label phases and predictions as estimates.               │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Dates
 * -----
 * Inputs and outputs are LOCAL calendar dates as `YYYY-MM-DD` strings. They
 * are converted to integer day numbers with date-fns calendar-day helpers,
 * so arithmetic never touches hours/UTC offsets and DST transitions or the
 * runtime time zone cannot shift a date.
 *
 * Algorithm
 * ---------
 *  1. Group logged period days into PERIODS: runs of dates where consecutive
 *     logged days are at most 2 days apart (i.e. a single missing day is
 *     bridged). Period length = end − start + 1, bridged days included.
 *  2. Cycle starts = first day of each period.
 *  3. Cycle lengths = differences between consecutive starts. Only lengths in
 *     [15, 60] count. avgCycle = mean of the last 6 valid lengths, else
 *     settings.defaultCycleLen. avgPeriod = mean of the last 6 period lengths,
 *     else settings.defaultPeriodLen. Projections use the rounded averages.
 *  4. For each completed cycle [S, nextS) with length L = nextS − S:
 *       menstrual  = the logged period (S … period end; bridged gap days too)
 *       O          = S + L − 14                      (estimated ovulation)
 *       ovulatory  = O−1 … O+1
 *       follicular = period end + 1 … O−2
 *       luteal     = O+2 … nextS − 1
 *     Priority when ranges overlap (very short cycles):
 *       menstrual > ovulatory > follicular / luteal.
 *     Cycles whose length is outside [15, 60] are IGNORED: they don't count
 *     towards averages and only their period days get a phase (menstrual);
 *     the rest of the cycle has phase null (cycleDay is still given).
 *  5. The open (current) cycle starts at the last logged start S and is
 *     projected with C = round(avgCycle), P = round(avgPeriod):
 *       its logged period is menstrual (predicted = false); every later day is
 *       predicted = true, phases computed as in step 4 with L = C.
 *       Then up to MAX_PREDICTED_CYCLES (3) further cycles are projected,
 *       each with predicted menstrual S' … S'+P−1. Days past that horizon get
 *       no phase/cycleDay ("no predictions beyond 3 cycles past the last log").
 *     If predictionsOn is false, no projection happens: every day that isn't
 *     part of a logged period has phase null (historical cycles included),
 *     predicted is always false, and cycleDay keeps counting in the open cycle
 *     for at most 60 days.
 *
 * Extras (beyond §9, documented decisions)
 *  - No period logged at all: if the onboarding `lastPeriodStart` is passed,
 *    it anchors an estimated cycle (all predicted, menstrual = anchor … +P−1)
 *    followed by the projected cycles. Once anything is logged, the anchor is
 *    ignored. Without an anchor and logs, every day is unknown (nulls).
 *  - If `today` is passed and the most recent logged period ended today or
 *    yesterday (may still be ongoing), it is extended with predicted
 *    menstrual days up to the average length of the COMPLETED periods (or
 *    settings.defaultPeriodLen if none), since the ongoing one is partial.
 *  - If a logged period is longer than the expected cycle, the open cycle is
 *    stretched to end the day after that period, so projections never start
 *    inside a logged period.
 *  - Days before the first logged period: unknown (all nulls).
 */
import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parse,
} from 'date-fns';

import type {
  CycleCalendar,
  CycleDayInfo,
  CycleOptions,
  CyclePhase,
  CycleSettings,
  CycleStats,
  CycleSummary,
  DateRange,
  FlowLevel,
  Period,
  PeriodDayInput,
} from './cycle-types';

export type * from './cycle-types';

export const MIN_CYCLE_LEN = 15;
export const MAX_CYCLE_LEN = 60;
export const AVERAGE_WINDOW = 6;
export const LUTEAL_LEN = 14;
/** Number of missing days bridged inside one period. */
export const MAX_PERIOD_GAP_DAYS = 1;
/** Projected cycles after the open (current) cycle. */
export const MAX_PREDICTED_CYCLES = 3;
/** Sanity bound for settings.defaultPeriodLen. */
export const MAX_PERIOD_LEN = 14;

// ───────────────────────── date helpers (local calendar days) ─────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Local midnight 1970-01-01, the zero of our day numbers. */
const EPOCH = new Date(1970, 0, 1);

/** `YYYY-MM-DD` → integer local-calendar day number. Throws on bad input. */
function toDay(date: string): number {
  if (!DATE_RE.test(date)) {
    throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`);
  }
  const d = parse(date, 'yyyy-MM-dd', EPOCH);
  if (!isValid(d) || format(d, 'yyyy-MM-dd') !== date) {
    throw new RangeError(`Invalid calendar date "${date}"`);
  }
  return differenceInCalendarDays(d, EPOCH);
}

/** Integer day number → `YYYY-MM-DD`. */
function fromDay(day: number): string {
  return format(addDays(EPOCH, day), 'yyyy-MM-dd');
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

// ───────────────────────── analysis (steps 1–3) ───────────────────────────

interface PeriodN {
  start: number;
  end: number;
}

interface Analysis {
  logged: Map<number, FlowLevel | null>;
  periods: PeriodN[];
  cycleLengths: number[];
  avgCycleLen: number;
  avgPeriodLen: number;
  cycleLenIsDefault: boolean;
  periodLenIsDefault: boolean;
}

function validateSettings(s: CycleSettings): void {
  const { defaultCycleLen: c, defaultPeriodLen: p } = s;
  if (!Number.isInteger(c) || c < MIN_CYCLE_LEN || c > MAX_CYCLE_LEN) {
    throw new RangeError(
      `defaultCycleLen must be an integer in [${MIN_CYCLE_LEN}, ${MAX_CYCLE_LEN}], got ${c}`,
    );
  }
  if (!Number.isInteger(p) || p < 1 || p > MAX_PERIOD_LEN) {
    throw new RangeError(
      `defaultPeriodLen must be an integer in [1, ${MAX_PERIOD_LEN}], got ${p}`,
    );
  }
}

function analyze(periodDays: readonly PeriodDayInput[], settings: CycleSettings): Analysis {
  validateSettings(settings);

  // Dedupe (a later entry for the same date wins) and sort.
  const logged = new Map<number, FlowLevel | null>();
  for (const pd of periodDays) logged.set(toDay(pd.date), pd.flow ?? null);
  const days = [...logged.keys()].sort((a, b) => a - b);

  // Step 1: group, bridging up to MAX_PERIOD_GAP_DAYS missing days.
  const periods: PeriodN[] = [];
  for (const day of days) {
    const last = periods[periods.length - 1];
    if (last && day - last.end <= MAX_PERIOD_GAP_DAYS + 1) last.end = day;
    else periods.push({ start: day, end: day });
  }

  // Steps 2–3.
  const cycleLengths: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    cycleLengths.push(periods[i]!.start - periods[i - 1]!.start);
  }
  const validLens = cycleLengths
    .filter((l) => l >= MIN_CYCLE_LEN && l <= MAX_CYCLE_LEN)
    .slice(-AVERAGE_WINDOW);
  const periodLens = periods.map((p) => p.end - p.start + 1).slice(-AVERAGE_WINDOW);

  return {
    logged,
    periods,
    cycleLengths,
    avgCycleLen: validLens.length ? mean(validLens) : settings.defaultCycleLen,
    avgPeriodLen: periodLens.length ? mean(periodLens) : settings.defaultPeriodLen,
    cycleLenIsDefault: validLens.length === 0,
    periodLenIsDefault: periodLens.length === 0,
  };
}

/** Averages and history derived from the logs (steps 1–3). Estimates. */
export function computeCycleStats(
  periodDays: readonly PeriodDayInput[],
  settings: CycleSettings,
): CycleStats {
  const a = analyze(periodDays, settings);
  const periods: Period[] = a.periods.map((p) => ({
    start: fromDay(p.start),
    end: fromDay(p.end),
    length: p.end - p.start + 1,
  }));
  return {
    periods,
    cycleLengths: a.cycleLengths,
    avgCycleLen: a.avgCycleLen,
    avgPeriodLen: a.avgPeriodLen,
    cycleLenIsDefault: a.cycleLenIsDefault,
    periodLenIsDefault: a.periodLenIsDefault,
    lastCycleLen: a.cycleLengths.length ? a.cycleLengths[a.cycleLengths.length - 1]! : null,
  };
}

// ───────────────────────── segments (steps 4–5) ───────────────────────────

type SegmentKind = 'actual' | 'ignored' | 'open' | 'projected';

/** One cycle laid out on the day line: [start, end). */
interface Segment {
  kind: SegmentKind;
  start: number;
  /** Exclusive. */
  end: number;
  /** Last menstrual day (inclusive), logged, bridged or predicted. */
  menstrualEnd: number;
  /** Last day backed by logs; later days are predicted. -Infinity if none. */
  loggedEnd: number;
  /** Ovulation estimate O = start + length − 14 (absolute day). */
  ovulation: number;
}

interface Layout {
  analysis: Analysis;
  segments: Segment[];
  /** Expected cycle length used for projections. */
  expectedLen: number;
  /** Start of the open cycle (last logged start or anchor), if any. */
  openStart: number | null;
  /** First projected start after the open cycle (null if predictions off). */
  nextStart: number | null;
}

function layout(
  periodDays: readonly PeriodDayInput[],
  settings: CycleSettings,
  options: CycleOptions,
): Layout {
  const analysis = analyze(periodDays, settings);
  const { periods } = analysis;
  const C = Math.round(analysis.avgCycleLen);
  const P = Math.round(analysis.avgPeriodLen);
  const predict = settings.predictionsOn;
  const segments: Segment[] = [];

  // Completed cycles.
  for (let i = 0; i + 1 < periods.length; i++) {
    const p = periods[i]!;
    const nextS = periods[i + 1]!.start;
    const len = nextS - p.start;
    segments.push({
      kind: len >= MIN_CYCLE_LEN && len <= MAX_CYCLE_LEN ? 'actual' : 'ignored',
      start: p.start,
      end: nextS,
      menstrualEnd: p.end,
      loggedEnd: nextS - 1,
      ovulation: p.start + len - LUTEAL_LEN,
    });
  }

  // Open cycle: last logged period, else onboarding anchor.
  let openStart: number | null = null;
  let menstrualEnd: number;
  let loggedEnd: number;
  const lastPeriod = periods[periods.length - 1];
  if (lastPeriod) {
    openStart = lastPeriod.start;
    loggedEnd = lastPeriod.end;
    menstrualEnd = lastPeriod.end;
    if (predict && options.today) {
      const today = toDay(options.today);
      if (lastPeriod.end >= today - 1) {
        // The last period may be incomplete, so don't let it shorten its own
        // expected length: use completed periods only (or the default).
        const done = periods.slice(0, -1).slice(-AVERAGE_WINDOW).map((p) => p.end - p.start + 1);
        const expected = done.length ? Math.round(mean(done)) : settings.defaultPeriodLen;
        menstrualEnd = Math.max(menstrualEnd, openStart + expected - 1);
      }
    }
  } else if (options.lastPeriodStart) {
    openStart = toDay(options.lastPeriodStart);
    loggedEnd = -Infinity;
    menstrualEnd = predict ? openStart + P - 1 : -Infinity;
  } else {
    return { analysis, segments, expectedLen: C, openStart: null, nextStart: null };
  }

  if (!predict) {
    // Track-only mode: count cycle days for at most MAX_CYCLE_LEN days.
    segments.push({
      kind: 'open',
      start: openStart,
      end: Math.max(openStart + MAX_CYCLE_LEN, loggedEnd + 1),
      menstrualEnd,
      loggedEnd,
      ovulation: NaN,
    });
    return { analysis, segments, expectedLen: C, openStart, nextStart: null };
  }

  const openEnd = Math.max(openStart + C, menstrualEnd + 1);
  segments.push({
    kind: 'open',
    start: openStart,
    end: openEnd,
    menstrualEnd,
    loggedEnd,
    ovulation: openEnd - LUTEAL_LEN,
  });
  for (let k = 0; k < MAX_PREDICTED_CYCLES; k++) {
    const s = openEnd + k * C;
    segments.push({
      kind: 'projected',
      start: s,
      end: s + C,
      menstrualEnd: s + P - 1,
      loggedEnd: -Infinity,
      ovulation: s + C - LUTEAL_LEN,
    });
  }
  return { analysis, segments, expectedLen: C, openStart, nextStart: openEnd };
}

function phaseInCycle(day: number, seg: Segment): CyclePhase {
  if (day <= seg.menstrualEnd) return 'menstrual';
  if (Math.abs(day - seg.ovulation) <= 1) return 'ovulatory';
  if (day <= seg.ovulation - 2) return 'follicular';
  return 'luteal';
}

function dayInfo(day: number, seg: Segment | undefined, l: Layout, predict: boolean): CycleDayInfo {
  const isPeriod = l.analysis.logged.has(day);
  const flow = l.analysis.logged.get(day) ?? null;
  if (!seg) return { phase: null, cycleDay: null, isPeriod, flow, predicted: false };

  const cycleDay = day - seg.start + 1;
  // Logged period span (bridged gap days included); never true for an anchor.
  const inLoggedPeriod = day <= Math.min(seg.menstrualEnd, seg.loggedEnd);
  const predicted = predict && day > seg.loggedEnd;

  let phase: CyclePhase | null;
  if (!predict || seg.kind === 'ignored') {
    // Only logged periods (incl. bridged gap days) get a phase.
    phase = inLoggedPeriod ? 'menstrual' : null;
  } else {
    phase = phaseInCycle(day, seg);
  }
  return { phase, cycleDay, isPeriod, flow, predicted };
}

// ───────────────────────── public API ─────────────────────────────────────

/**
 * Phase estimate for every date in `range` (inclusive, ascending order).
 * Every returned phase is an ESTIMATE, not medical advice.
 */
export function computeCycleCalendar(
  periodDays: readonly PeriodDayInput[],
  settings: CycleSettings,
  range: DateRange,
  options: CycleOptions = {},
): CycleCalendar {
  const from = toDay(range.from);
  const to = toDay(range.to);
  if (from > to) throw new RangeError(`range.from (${range.from}) is after range.to (${range.to})`);

  const l = layout(periodDays, settings, options);
  const out: CycleCalendar = new Map();
  let i = 0;
  for (let day = from; day <= to; day++) {
    while (i < l.segments.length && l.segments[i]!.end <= day) i++;
    const seg = l.segments[i];
    const inSeg = seg && seg.start <= day ? seg : undefined;
    out.set(fromDay(day), dayInfo(day, inSeg, l, settings.predictionsOn));
  }
  return out;
}

/**
 * "Today card" summary: current cycle day & phase, next period estimate and
 * averages. Anchored on the most recent logged period start (or onboarding
 * anchor): if the expected period hasn't been logged yet, the cycle day keeps
 * counting and `isLate` is set rather than silently rolling into a projected
 * cycle. Everything is an ESTIMATE, not medical advice.
 */
export function computeCycleSummary(
  periodDays: readonly PeriodDayInput[],
  settings: CycleSettings,
  today: string,
  options: Omit<CycleOptions, 'today'> = {},
): CycleSummary {
  const t = toDay(today);
  const opts: CycleOptions = { ...options, today };
  const l = layout(periodDays, settings, opts);
  const a = l.analysis;
  const entry = computeCycleCalendar(periodDays, settings, { from: today, to: today }, opts).get(today)!;

  const base = {
    isEstimate: true as const,
    today,
    phase: entry.phase,
    expectedCycleLen: l.expectedLen,
    avgCycleLen: a.avgCycleLen,
    avgPeriodLen: a.avgPeriodLen,
    cycleLenIsDefault: a.cycleLenIsDefault,
    periodLenIsDefault: a.periodLenIsDefault,
    lastCycleLen: a.cycleLengths.length ? a.cycleLengths[a.cycleLengths.length - 1]! : null,
  };
  const none = { cycleDay: null, currentCycleStart: null, nextPeriodStart: null, daysUntilNextPeriod: null, isLate: false };

  if (l.openStart === null || entry.cycleDay === null) return { ...base, ...none };

  if (t >= l.openStart) {
    const next = l.nextStart;
    return {
      ...base,
      cycleDay: t - l.openStart + 1,
      currentCycleStart: fromDay(l.openStart),
      nextPeriodStart: next === null ? null : fromDay(next),
      daysUntilNextPeriod: next === null ? null : next - t,
      isLate: next !== null && next <= t,
    };
  }

  // `today` is in the past, inside a completed cycle: the next start is known.
  const start = t - entry.cycleDay + 1;
  const next = a.periods.find((p) => p.start > t)!.start;
  return {
    ...base,
    cycleDay: entry.cycleDay,
    currentCycleStart: fromDay(start),
    nextPeriodStart: fromDay(next),
    daysUntilNextPeriod: next - t,
    isLate: false,
  };
}
