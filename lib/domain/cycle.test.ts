import { afterEach, describe, expect, it } from 'vitest';

import {
  computeCycleCalendar,
  computeCycleStats,
  computeCycleSummary,
  MAX_PREDICTED_CYCLES,
  type CycleCalendar,
  type CycleSettings,
  type PeriodDayInput,
} from './cycle';

const SETTINGS: CycleSettings = { defaultCycleLen: 28, defaultPeriodLen: 5, predictionsOn: true };
const OFF: CycleSettings = { ...SETTINGS, predictionsOn: false };

/** Consecutive period days starting at `start` (local dates, no Date math). */
function period(start: string, len: number, flow?: PeriodDayInput['flow']): PeriodDayInput[] {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  return Array.from({ length: len }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);
    const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return flow ? { date, flow } : { date };
  });
}

const CODE = { menstrual: 'M', follicular: 'F', ovulatory: 'O', luteal: 'L' } as const;
/** Compact phase string, one char per day: M/F/O/L, '.' = null. */
const phases = (cal: CycleCalendar) =>
  [...cal.values()].map((v) => (v.phase ? CODE[v.phase] : '.')).join('');
/** 'p' = predicted, '-' = not. */
const predicted = (cal: CycleCalendar) => [...cal.values()].map((v) => (v.predicted ? 'p' : '-')).join('');
const cycleDays = (cal: CycleCalendar) => [...cal.values()].map((v) => v.cycleDay);

// A standard 28-day cycle with a 5-day period:
//   d1-5 M, d6-13 F (8), d14-16 O (O = d15), d17-28 L (12)
const STD28 = 'MMMMM' + 'F'.repeat(8) + 'OOO' + 'L'.repeat(12);

describe('no periods logged', () => {
  it('without an onboarding anchor every day is unknown', () => {
    const cal = computeCycleCalendar([], SETTINGS, { from: '2026-03-01', to: '2026-03-10' });
    expect(cal.size).toBe(10);
    for (const v of cal.values()) {
      expect(v).toEqual({ phase: null, cycleDay: null, isPeriod: false, flow: null, predicted: false });
    }
  });

  it('falls back to onboarding values when an anchor start is known', () => {
    const cal = computeCycleCalendar(
      [],
      SETTINGS,
      { from: '2026-03-01', to: '2026-03-29' },
      { lastPeriodStart: '2026-03-01' },
    );
    expect(phases(cal)).toBe(STD28 + 'M');
    expect(predicted(cal)).toBe('p'.repeat(29)); // nothing is logged
    expect([...cal.values()].some((v) => v.isPeriod)).toBe(false);
    expect(cal.get('2026-03-29')!.cycleDay).toBe(1);
  });

  it('uses custom onboarding lengths', () => {
    const cal = computeCycleCalendar(
      [],
      { ...SETTINGS, defaultCycleLen: 32, defaultPeriodLen: 4 },
      { from: '2026-03-01', to: '2026-04-02' },
      { lastPeriodStart: '2026-03-01' },
    );
    // O = d19: M d1-4, F d5-17, O d18-20, L d21-32, next M d33
    expect(phases(cal)).toBe('MMMM' + 'F'.repeat(13) + 'OOO' + 'L'.repeat(12) + 'M');
  });

  it('ignores the anchor once anything is logged', () => {
    const cal = computeCycleCalendar(
      period('2026-03-10', 5),
      SETTINGS,
      { from: '2026-03-01', to: '2026-03-10' },
      { lastPeriodStart: '2026-03-01' },
    );
    expect(phases(cal)).toBe('.........M');
  });

  it('anchor with predictions off gives cycle days but no phases', () => {
    const cal = computeCycleCalendar(
      [],
      OFF,
      { from: '2026-03-01', to: '2026-03-03' },
      { lastPeriodStart: '2026-03-01' },
    );
    expect(phases(cal)).toBe('...');
    expect(cycleDays(cal)).toEqual([1, 2, 3]);
  });
});

describe('single period', () => {
  const logs = period('2026-03-01', 5, 'medium');
  const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-02-27', to: '2026-03-30' });

  it('lays out one default-length cycle then projects', () => {
    // Feb 27-28 unknown, Mar 1-28 = cycle, Mar 29-30 = predicted next period.
    expect(phases(cal)).toBe('..' + STD28 + 'MM');
    expect(cycleDays(cal).slice(0, 4)).toEqual([null, null, 1, 2]);
    expect(cal.get('2026-03-29')!.cycleDay).toBe(1);
  });

  it('logged days are periods with flow and not predicted; later days are predicted', () => {
    expect(predicted(cal)).toBe('--' + '-----' + 'p'.repeat(25));
    expect(cal.get('2026-03-03')).toMatchObject({ isPeriod: true, flow: 'medium', phase: 'menstrual' });
    expect(cal.get('2026-03-29')).toMatchObject({ isPeriod: false, flow: null, phase: 'menstrual' });
  });

  it('stats fall back to the default cycle length', () => {
    const s = computeCycleStats(logs, SETTINGS);
    expect(s).toMatchObject({
      avgCycleLen: 28,
      cycleLenIsDefault: true,
      avgPeriodLen: 5,
      periodLenIsDefault: false,
      lastCycleLen: null,
      periods: [{ start: '2026-03-01', end: '2026-03-05', length: 5 }],
    });
  });
});

describe('multiple / irregular cycles', () => {
  // Starts: Jan 1, Jan 29 (+28), Feb 28 (+30). Periods 5, 5, 4 days.
  const logs = [
    ...period('2026-01-01', 5),
    ...period('2026-01-29', 5),
    ...period('2026-02-28', 4),
  ];

  it('uses each completed cycle’s own length for ovulation', () => {
    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-01-01', to: '2026-02-27' });
    // Cycle 1: 28 days (standard). Cycle 2: 30 days, O = d17 → F d6-15, O d16-18, L d19-30.
    expect(phases(cal)).toBe(STD28 + 'MMMMM' + 'F'.repeat(10) + 'OOO' + 'L'.repeat(12));
    expect(predicted(cal)).toBe('-'.repeat(58)); // all past, logged-backed
  });

  it('projects the open cycle with the rounded average', () => {
    const s = computeCycleStats(logs, SETTINGS);
    expect(s.cycleLengths).toEqual([28, 30]);
    expect(s.avgCycleLen).toBe(29);
    expect(s.avgPeriodLen).toBeCloseTo(14 / 3);
    expect(s.lastCycleLen).toBe(30);
    // Open cycle from Feb 28, C = 29, P = round(4.67) = 5. O = d16.
    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-02-28', to: '2026-03-29' });
    expect(phases(cal)).toBe('MMMM' + 'F'.repeat(10) + 'OOO' + 'L'.repeat(12) + 'M');
    // Next projected period uses avg period length (5 days).
    const next = computeCycleCalendar(logs, SETTINGS, { from: '2026-03-29', to: '2026-04-03' });
    expect(phases(next)).toBe('MMMMMF');
  });

  it('averages only the last 6 valid cycle lengths', () => {
    // Lengths: 20, 40, 26, 28, 30, 32, 25, 27 → last six = 26..27 → mean 28.
    const lens = [20, 40, 26, 28, 30, 32, 25, 27];
    const starts = ['2025-01-01'];
    let day = new Date(2025, 0, 1);
    for (const l of lens) {
      day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + l);
      starts.push(
        `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
      );
    }
    // Period lengths 7,7,7 then 3,4,5,6,3,4 for the last six → mean 25/6.
    const plens = [7, 7, 7, 3, 4, 5, 6, 3, 4];
    const logs2 = starts.flatMap((s, i) => period(s, plens[i]!));
    const s = computeCycleStats(logs2, SETTINGS);
    expect(s.cycleLengths).toEqual(lens);
    expect(s.avgCycleLen).toBe(28);
    expect(s.avgPeriodLen).toBeCloseTo(25 / 6);
    expect(s.lastCycleLen).toBe(27);
  });

  it('accepts unsorted and duplicated input (later duplicate wins)', () => {
    const shuffled = [...logs].reverse();
    shuffled.push({ date: '2026-01-02', flow: 'heavy' });
    const a = computeCycleCalendar(logs, SETTINGS, { from: '2026-01-01', to: '2026-04-30' });
    const b = computeCycleCalendar(shuffled, SETTINGS, { from: '2026-01-01', to: '2026-04-30' });
    expect(phases(b)).toBe(phases(a));
    expect(b.get('2026-01-02')!.flow).toBe('heavy');
  });
});

describe('out-of-range cycles are ignored', () => {
  it('a >60-day gap does not count towards the average and gets no phases', () => {
    // Starts: Jan 1, Jan 29 (+28), May 1 (+92), May 29 (+28)
    const logs = [
      ...period('2026-01-01', 5),
      ...period('2026-01-29', 5),
      ...period('2026-05-01', 5),
      ...period('2026-05-29', 5),
    ];
    const s = computeCycleStats(logs, { ...SETTINGS, defaultCycleLen: 35 });
    expect(s.cycleLengths).toEqual([28, 92, 28]);
    expect(s.avgCycleLen).toBe(28);
    expect(s.lastCycleLen).toBe(28);

    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-01-29', to: '2026-05-01' });
    const p = phases(cal);
    expect(p.slice(0, 5)).toBe('MMMMM');
    expect(p.slice(5, 92)).toBe('.'.repeat(87)); // ignored cycle: unknown
    expect(p.at(-1)).toBe('M');
    expect(cal.get('2026-04-30')!.cycleDay).toBe(92);
  });

  it('a <15-day cycle (e.g. mid-cycle spotting logged) is ignored', () => {
    // Starts: Mar 1, Mar 11 (+10, ignored), Mar 29 (+18, valid).
    const logs = [...period('2026-03-01', 5), { date: '2026-03-11', flow: 'spotting' as const }, ...period('2026-03-29', 5)];
    const s = computeCycleStats(logs, SETTINGS);
    expect(s.cycleLengths).toEqual([10, 18]);
    expect(s.avgCycleLen).toBe(18);
    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-03-01', to: '2026-03-11' });
    expect(phases(cal)).toBe('MMMMM.....M');
  });

  it('only out-of-range cycles → default length', () => {
    const logs = [...period('2026-01-01', 5), ...period('2026-05-01', 5)];
    const s = computeCycleStats(logs, { ...SETTINGS, defaultCycleLen: 30 });
    expect(s.avgCycleLen).toBe(30);
    expect(s.cycleLenIsDefault).toBe(true);
  });
});

describe('period grouping', () => {
  it('bridges a single missing day into one period', () => {
    const logs = [
      { date: '2026-03-01' },
      { date: '2026-03-02' },
      { date: '2026-03-04' },
      { date: '2026-03-05' },
    ];
    const s = computeCycleStats(logs, SETTINGS);
    expect(s.periods).toEqual([{ start: '2026-03-01', end: '2026-03-05', length: 5 }]);
    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-03-01', to: '2026-03-06' });
    expect(phases(cal)).toBe('MMMMMF');
    expect(cal.get('2026-03-03')).toMatchObject({ phase: 'menstrual', isPeriod: false, predicted: false });
  });

  it('a 2-day gap starts a new period', () => {
    const logs = [{ date: '2026-03-01' }, { date: '2026-03-02' }, { date: '2026-03-05' }];
    expect(computeCycleStats(logs, SETTINGS).periods.map((p) => p.start)).toEqual([
      '2026-03-01',
      '2026-03-05',
    ]);
  });

  it('bridges a gap at the year boundary', () => {
    const logs = [{ date: '2025-12-30' }, { date: '2026-01-01' }];
    expect(computeCycleStats(logs, SETTINGS).periods).toEqual([
      { start: '2025-12-30', end: '2026-01-01', length: 3 },
    ]);
  });
});

describe('very short cycles: menstrual wins over overlaps', () => {
  it('ovulatory window inside the period is shown as menstrual', () => {
    // 17-day cycles, 5-day periods → O = d4, ovulatory d3-5 all inside the period.
    const logs = [...period('2026-03-01', 5), ...period('2026-03-18', 5)];
    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-03-01', to: '2026-03-17' });
    expect(phases(cal)).toBe('MMMMM' + 'L'.repeat(12));
  });

  it('partial overlap keeps the remaining ovulatory days; no follicular', () => {
    // 17-day cycle, 3-day period: O = d4 → d3 menstrual, d4-5 ovulatory, d6+ luteal.
    const logs = [...period('2026-03-01', 3), ...period('2026-03-18', 3)];
    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-03-01', to: '2026-03-17' });
    expect(phases(cal)).toBe('MMMOO' + 'L'.repeat(12));
  });
});

describe('predictions horizon', () => {
  it(`projects at most ${MAX_PREDICTED_CYCLES} cycles beyond the open cycle`, () => {
    const logs = period('2026-01-01', 5);
    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-01-01', to: '2026-12-31' });
    const p = phases(cal);
    // Open cycle + 3 projected = 4 × 28 = 112 days, then nothing.
    expect(p.slice(0, 112)).toBe(STD28.repeat(4));
    expect(p.slice(112)).toBe('.'.repeat(365 - 112));
    expect(cal.get('2026-04-22')!.cycleDay).toBe(28);
    expect(cal.get('2026-04-23')).toEqual({
      phase: null,
      cycleDay: null,
      isPeriod: false,
      flow: null,
      predicted: false,
    });
  });

  it('a range spanning past and future mixes logged and predicted days', () => {
    const logs = [...period('2026-01-01', 5), ...period('2026-01-29', 5)];
    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-01-20', to: '2026-03-05' });
    // Jan 20-28: end of completed cycle (luteal, not predicted).
    // Jan 29-Feb 2: logged period. Feb 3-…: predicted.
    expect(predicted(cal)).toBe('-'.repeat(9) + '-'.repeat(5) + 'p'.repeat(31));
    expect(phases(cal)).toBe('L'.repeat(9) + STD28 + 'MMMMMFFF');
  });

  it('range entirely before any log is unknown', () => {
    const cal = computeCycleCalendar(period('2026-06-01', 5), SETTINGS, { from: '2026-01-01', to: '2026-01-05' });
    expect(phases(cal)).toBe('.....');
  });

  it('a logged period longer than the expected cycle pushes the projection back', () => {
    const logs = period('2026-03-01', 20); // pathological, but must not overlap
    const cal = computeCycleCalendar(logs, { ...SETTINGS, defaultCycleLen: 15 }, {
      from: '2026-03-20',
      to: '2026-03-22',
    });
    expect(phases(cal)).toBe('MMM'); // logged day 20, then projected period day 1-2
    expect(cycleDays(cal)).toEqual([20, 1, 2]);
  });
});

describe('predictions off (track-only mode)', () => {
  const logs = [...period('2026-01-01', 5, 'light'), ...period('2026-01-29', 5)];

  it('only logged period days get a phase; nothing is predicted', () => {
    const cal = computeCycleCalendar(logs, OFF, { from: '2026-01-01', to: '2026-03-31' });
    const p = phases(cal);
    expect(p).toBe('M'.repeat(5) + '.'.repeat(23) + 'M'.repeat(5) + '.'.repeat(90 - 33));
    expect(predicted(cal)).toBe('-'.repeat(90));
  });

  it('cycle day keeps counting in the open cycle for up to 60 days', () => {
    const cal = computeCycleCalendar(logs, OFF, { from: '2026-03-28', to: '2026-03-30' });
    // Jan 29 + 59 = Mar 28 (day 60); Mar 29 is beyond.
    expect(cycleDays(cal)).toEqual([59, 60, null]);
  });

  it('bridged gap days still count as menstrual', () => {
    const cal = computeCycleCalendar(
      [{ date: '2026-03-01' }, { date: '2026-03-03' }],
      OFF,
      { from: '2026-03-01', to: '2026-03-04' },
    );
    expect(phases(cal)).toBe('MMM.');
  });
});

describe('ongoing period (today option)', () => {
  const logs = period('2026-03-01', 2);

  it('extends a possibly-ongoing period to the average length', () => {
    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-03-01', to: '2026-03-06' }, { today: '2026-03-02' });
    expect(phases(cal)).toBe('MMMMMF');
    expect(predicted(cal)).toBe('--pppp');
  });

  it('uses completed periods (not the partial one) for the expected length', () => {
    const hist = [...period('2026-02-01', 3), ...period('2026-03-01', 1)];
    const cal = computeCycleCalendar(hist, SETTINGS, { from: '2026-03-01', to: '2026-03-04' }, { today: '2026-03-01' });
    expect(phases(cal)).toBe('MMMF');
  });

  it('does not extend once the period clearly ended', () => {
    const cal = computeCycleCalendar(logs, SETTINGS, { from: '2026-03-01', to: '2026-03-06' }, { today: '2026-03-10' });
    expect(phases(cal)).toBe('MMFFFF');
  });
});

describe('recalculation on edit (nothing stored)', () => {
  it('editing a past period changes derived phases and averages', () => {
    const before = [...period('2026-01-01', 5), ...period('2026-01-29', 5)];
    const after = [...period('2026-01-01', 5), ...period('2026-02-02', 5)]; // moved 4 days later
    const range = { from: '2026-01-01', to: '2026-02-01' };
    const a = computeCycleCalendar(before, SETTINGS, range);
    const b = computeCycleCalendar(after, SETTINGS, range);
    expect(phases(a)).toBe(STD28 + 'MMMM');
    // 32-day cycle: O = d19 → F d6-17, O d18-20, L d21-32
    expect(phases(b)).toBe('MMMMM' + 'F'.repeat(12) + 'OOO' + 'L'.repeat(12));
    expect(computeCycleStats(after, SETTINGS).avgCycleLen).toBe(32);
    // Deleting the second period reverts to defaults.
    expect(computeCycleStats(after.slice(0, 5), SETTINGS).cycleLenIsDefault).toBe(true);
  });

  it('does not mutate its input', () => {
    const logs = Object.freeze([...period('2026-01-02', 3), ...period('2026-01-01', 1)].map((x) => Object.freeze(x)));
    expect(() => computeCycleCalendar(logs, SETTINGS, { from: '2026-01-01', to: '2026-01-31' })).not.toThrow();
  });
});

describe('dates are time-zone and DST independent', () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  const logs = [...period('2026-02-10', 5), ...period('2026-03-09', 5), ...period('2026-10-20', 4)];
  // Covers US DST (Mar 8, Nov 1 2026), EU DST (Mar 29, Oct 25 2026),
  // and Chile (midnight-skipping transitions in Apr/Sep).
  const range = { from: '2026-01-01', to: '2026-12-31' };
  const zones = ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London', 'America/Santiago', 'Australia/Lord_Howe', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];

  const snapshot = () => JSON.stringify([...computeCycleCalendar(logs, SETTINGS, range)]);

  it('produces identical output in every time zone', () => {
    process.env.TZ = 'UTC';
    const reference = snapshot();
    for (const tz of zones) {
      process.env.TZ = tz;
      expect(snapshot(), tz).toBe(reference);
    }
  });

  it('every calendar day appears exactly once across DST transitions', () => {
    for (const tz of zones) {
      process.env.TZ = tz;
      const keys = [...computeCycleCalendar(logs, SETTINGS, range).keys()];
      expect(keys.length, tz).toBe(365);
      expect(new Set(keys).size, tz).toBe(365);
      expect(keys.includes('2026-03-08') && keys.includes('2026-11-01') && keys.includes('2026-04-05'), tz).toBe(true);
      expect(keys.at(-1)).toBe('2026-12-31');
    }
  });

  it('cycle across the US spring-forward day is still 28 days', () => {
    process.env.TZ = 'America/New_York';
    const l = [...period('2026-02-15', 5), ...period('2026-03-15', 5)];
    expect(computeCycleStats(l, SETTINGS).cycleLengths).toEqual([28]);
  });
});

describe('input validation', () => {
  it('rejects malformed or impossible dates', () => {
    expect(() => computeCycleStats([{ date: '2026-3-1' }], SETTINGS)).toThrow(RangeError);
    expect(() => computeCycleStats([{ date: '2026-02-30' }], SETTINGS)).toThrow(RangeError);
    expect(() => computeCycleStats([{ date: '2026-03-01T00:00:00Z' }], SETTINGS)).toThrow(RangeError);
  });

  it('rejects an inverted range', () => {
    expect(() => computeCycleCalendar([], SETTINGS, { from: '2026-03-02', to: '2026-03-01' })).toThrow(RangeError);
  });

  it('rejects unreasonable settings', () => {
    expect(() => computeCycleStats([], { ...SETTINGS, defaultCycleLen: 10 })).toThrow(RangeError);
    expect(() => computeCycleStats([], { ...SETTINGS, defaultCycleLen: 28.5 })).toThrow(RangeError);
    expect(() => computeCycleStats([], { ...SETTINGS, defaultPeriodLen: 0 })).toThrow(RangeError);
  });

  it('a one-day range returns one entry', () => {
    expect(computeCycleCalendar([], SETTINGS, { from: '2026-03-01', to: '2026-03-01' }).size).toBe(1);
  });
});

describe('computeCycleSummary', () => {
  const logs = [...period('2026-01-01', 5), ...period('2026-01-29', 5), ...period('2026-02-28', 4)];

  it('"Day N of ~M" with next period estimate', () => {
    // Open cycle Feb 28, C = 29 → next period Mar 29.
    const s = computeCycleSummary(logs, SETTINGS, '2026-03-08');
    expect(s).toMatchObject({
      isEstimate: true,
      cycleDay: 9,
      expectedCycleLen: 29,
      phase: 'follicular',
      currentCycleStart: '2026-02-28',
      nextPeriodStart: '2026-03-29',
      daysUntilNextPeriod: 21,
      isLate: false,
      avgCycleLen: 29,
      lastCycleLen: 30,
      cycleLenIsDefault: false,
    });
  });

  it('flags a late period and keeps counting the cycle day', () => {
    const s = computeCycleSummary(logs, SETTINGS, '2026-04-01');
    expect(s).toMatchObject({ cycleDay: 33, nextPeriodStart: '2026-03-29', daysUntilNextPeriod: -3, isLate: true });
  });

  it('works from onboarding values alone', () => {
    const s = computeCycleSummary([], SETTINGS, '2026-03-10', { lastPeriodStart: '2026-03-01' });
    expect(s).toMatchObject({
      cycleDay: 10,
      phase: 'follicular',
      expectedCycleLen: 28,
      nextPeriodStart: '2026-03-29',
      daysUntilNextPeriod: 19,
      cycleLenIsDefault: true,
      periodLenIsDefault: true,
      lastCycleLen: null,
    });
  });

  it('returns nulls when nothing is known', () => {
    const s = computeCycleSummary([], SETTINGS, '2026-03-10');
    expect(s).toMatchObject({ cycleDay: null, phase: null, nextPeriodStart: null, daysUntilNextPeriod: null, isLate: false });
  });

  it('predictions off: cycle day but no phase or next-period estimate', () => {
    const s = computeCycleSummary(logs, OFF, '2026-03-08');
    expect(s).toMatchObject({ cycleDay: 9, phase: null, nextPeriodStart: null, daysUntilNextPeriod: null, isLate: false });
  });

  it('treats an in-progress period as ongoing', () => {
    const s = computeCycleSummary(period('2026-03-01', 2), SETTINGS, '2026-03-03');
    expect(s).toMatchObject({ cycleDay: 3, phase: 'menstrual' });
  });

  it('a past "today" inside a completed cycle uses the known next start', () => {
    const s = computeCycleSummary(logs, SETTINGS, '2026-01-10');
    expect(s).toMatchObject({
      cycleDay: 10,
      phase: 'follicular',
      currentCycleStart: '2026-01-01',
      nextPeriodStart: '2026-01-29',
      daysUntilNextPeriod: 19,
    });
  });

  it('beyond the prediction horizon nothing is claimed', () => {
    const s = computeCycleSummary(period('2026-01-01', 5), SETTINGS, '2026-12-01');
    expect(s).toMatchObject({ cycleDay: null, phase: null, nextPeriodStart: null });
  });
});
