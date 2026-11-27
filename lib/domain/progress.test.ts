import { describe, expect, it } from "vitest";
import {
  bucketWeeks,
  buildExerciseProgress,
  chartPoint,
  formatPrimary,
  formatPrimaryChange,
  formatSecondary,
  formatSecondaryChange,
  progressHint,
  progressKind,
  trendOf,
  weekLabel,
  type ExerciseHistory,
  type ProgressSession,
} from "./progress";

const s = (date: string, sets: [reps: number | null, kg: number | null, sec?: number | null][], id = date): ProgressSession => ({
  activityId: id,
  date,
  sets: sets.map(([reps, weightKg, durationSec = null]) => ({ reps, weightKg, durationSec })),
});

const squat = (sessions: ProgressSession[]): ExerciseHistory => ({
  exerciseId: "ex-squat",
  name: "Barbell Squat",
  tracking: "reps",
  sessions,
});

// 2026-11-23 is a Monday, 2026-11-22 a Sunday.
const NOW = new Date("2026-11-27T06:00:00Z"); // Fri 27 Nov in Asia/Kolkata
const opts = { weekStartsOn: 1 as const, timezone: "Asia/Kolkata", now: NOW };

describe("bucketWeeks", () => {
  it("is empty for no sessions", () => {
    expect(bucketWeeks([], 1)).toEqual([]);
  });

  it("buckets by the user's week start (Monday vs Sunday)", () => {
    const sessions = [s("2026-11-22", [[5, 40]]), s("2026-11-23", [[5, 40]])];
    // Monday start: Sun 22 belongs to the week of Mon 16, Mon 23 starts a new one.
    expect(bucketWeeks(sessions, 1).map((w) => w.weekStart)).toEqual(["2026-11-16", "2026-11-23"]);
    // Sunday start: both are in the week of Sun 22.
    const sun = bucketWeeks(sessions, 0);
    expect(sun.map((w) => [w.weekStart, w.weekEnd, w.sessions])).toEqual([["2026-11-22", "2026-11-28", 2]]);
  });

  it("sums sets, reps and volume and picks the heaviest set (most kg, then most reps)", () => {
    const [w] = bucketWeeks(
      [
        s("2026-11-23", [
          [8, 40],
          [8, 42.5],
          [6, 42.5],
        ]),
        s("2026-11-26", [
          [10, 42.5],
          [5, null], // a bodyweight set: no volume
        ]),
      ],
      1,
    );
    expect(w).toMatchObject({
      sessions: 2,
      sets: 5,
      reps: 37,
      volumeKg: 8 * 40 + 8 * 42.5 + 6 * 42.5 + 10 * 42.5,
      topSet: { weightKg: 42.5, reps: 10 },
      bestReps: 10,
    });
  });

  it("totals and best time for timed sets", () => {
    const [w] = bucketWeeks([s("2026-11-23", [[null, null, 60], [null, null, 45]]), s("2026-11-24", [[null, null, 75]])], 1);
    expect(w).toMatchObject({ totalSec: 180, bestSec: 75, reps: 0, bestReps: null, topSet: null });
  });
});

describe("progressKind", () => {
  it("weighted when any set has weight", () => {
    expect(progressKind("reps", [s("2026-11-23", [[10, null], [8, 20]])])).toBe("weighted");
  });
  it("bodyweight reps when nothing has weight", () => {
    expect(progressKind("reps", [s("2026-11-23", [[10, null]])])).toBe("bodyweight");
  });
  it("timed for time exercises and for time-only sets", () => {
    expect(progressKind("time", [s("2026-11-23", [[null, null, 60]])])).toBe("timed");
    expect(progressKind("reps", [s("2026-11-23", [[null, null, 30]])])).toBe("timed");
    expect(progressKind("time", [])).toBe("timed");
  });
});

describe("buildExerciseProgress", () => {
  it("has no weeks, trend or change when never logged", () => {
    const p = buildExerciseProgress(squat([]), opts);
    expect(p.weeks).toEqual([]);
    expect(p.trend).toBeNull();
    expect(p.overall).toBeNull();
    expect(p.lastDone).toBeNull();
  });

  it("one week: stats but no change yet", () => {
    const p = buildExerciseProgress(squat([s("2026-11-24", [[8, 40]])]), opts);
    expect(p.weeks).toHaveLength(1);
    expect(p.weeks[0]!.change).toBeNull();
    expect(p.trend).toBeNull();
    expect(p.overall).toBeNull();
    expect(p.lastDone).toBe("2026-11-24");
  });

  it("change vs the previous logged week and overall since the first", () => {
    const p = buildExerciseProgress(
      squat([
        s("2026-11-03", [[8, 40], [8, 40]]), // wk 2 Nov: top 40, vol 640
        // a week off (9 Nov)
        s("2026-11-17", [[8, 42.5], [8, 42.5]]), // wk 16 Nov: top 42.5, vol 680
        s("2026-11-24", [[6, 42.5], [6, 42.5]]), // wk 23 Nov: top 42.5×6, vol 510
      ]),
      opts,
    );
    expect(p.kind).toBe("weighted");
    expect(p.weeks.map((w) => w.weekStart)).toEqual(["2026-11-02", "2026-11-16", "2026-11-23"]);
    expect(p.weeks[1]!.change).toEqual({ primary: 2.5, secondary: 40 });
    expect(p.weeks[1]!.trend).toBe("up");
    // Same top weight, less volume → down.
    expect(p.weeks[2]!.change).toEqual({ primary: 0, secondary: -170 });
    expect(p.trend).toBe("down");
    expect(p.overall).toEqual({ primary: 2.5, secondary: -130 });
  });

  it("works out 'this week' in the user's time zone", () => {
    const sun = new Date("2026-11-22T20:00:00Z"); // still Sun 22 in UTC; already Mon 23 in Kolkata
    const kolkata = buildExerciseProgress(squat([]), { ...opts, now: sun });
    expect(kolkata.today).toBe("2026-11-23");
    expect(kolkata.thisWeekStart).toBe("2026-11-23");
    const la = buildExerciseProgress(squat([]), { ...opts, timezone: "America/Los_Angeles", now: sun });
    expect(la.today).toBe("2026-11-22");
    expect(la.thisWeekStart).toBe("2026-11-16");
  });
});

describe("trendOf", () => {
  it("uses the headline first, then the volume", () => {
    expect(trendOf({ primary: 2.5, secondary: -100 })).toBe("up");
    expect(trendOf({ primary: -1, secondary: 100 })).toBe("down");
    expect(trendOf({ primary: 0, secondary: 10 })).toBe("up");
    expect(trendOf({ primary: 0, secondary: 0 })).toBe("flat");
  });
});

describe("display", () => {
  const p = buildExerciseProgress(squat([s("2026-11-17", [[8, 40]]), s("2026-11-24", [[8, 42.5], [8, 42.5]])]), opts);
  const last = p.weeks[1]!;

  it("formats in kg", () => {
    expect(formatPrimary(last, "weighted", "kg")).toBe("42.5 KG × 8");
    expect(formatSecondary(last, "weighted", "kg")).toBe("680 KG");
    expect(formatPrimaryChange(last.change!.primary, "weighted", "kg")).toBe("+2.5 KG");
    expect(formatSecondaryChange(last.change!.secondary, "weighted", "kg")).toBe("+360 KG");
  });

  it("converts to lb", () => {
    expect(formatPrimary(last, "weighted", "lb")).toBe("93.7 LB × 8");
    expect(formatSecondary(last, "weighted", "lb")).toBe("1,499 LB");
    expect(formatPrimaryChange(2.5, "weighted", "lb")).toBe("+5.5 LB");
    expect(formatPrimaryChange(-2.5, "weighted", "lb")).toBe("−5.5 LB");
    expect(chartPoint(last, "weighted", "lb")).toEqual({ label: "23 NOV", primary: 93.7, secondary: 1499 });
  });

  it("formats bodyweight and timed changes", () => {
    expect(formatPrimaryChange(1, "bodyweight", "kg")).toBe("+1 REP");
    expect(formatSecondaryChange(-6, "bodyweight", "kg")).toBe("−6 REPS");
    expect(formatPrimaryChange(15, "timed", "kg")).toBe("+15s");
    expect(formatSecondaryChange(90, "timed", "kg")).toBe("+1:30");
    expect(formatPrimaryChange(0, "weighted", "kg")).toBe("±0 KG");
  });

  it("labels the current and previous week", () => {
    expect(weekLabel("2026-11-23", "2026-11-29", p.thisWeekStart)).toBe("THIS WEEK");
    expect(weekLabel("2026-11-16", "2026-11-22", p.thisWeekStart)).toBe("LAST WEEK");
    expect(weekLabel("2026-10-26", "2026-11-01", p.thisWeekStart)).toBe("26 OCT – 1 NOV");
  });

  it("slip hint", () => {
    expect(progressHint(p, "kg")).toBe("TOP SET 42.5 KG × 8 · +2.5 KG VS PREV WEEK");
    expect(progressHint(buildExerciseProgress(squat([]), opts), "kg")).toBeNull();
  });
});
