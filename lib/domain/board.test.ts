import { describe, expect, it } from "vitest";
import type { ActivityDetail } from "./activity-types";
import {
  addMonths,
  aggregateDays,
  buildBoard,
  currentStreak,
  eachDate,
  endOfMonth,
  homeLedgerNumbers,
  longestStreak,
  monthlyBreakdown,
  normalizeWeekStart,
  resolveRange,
  shiftDate,
  startOfWeek,
  streakReferenceDay,
  streakWindow,
  STREAK_LOOKBACK_DAYS,
  strengthVolumeKg,
  totalize,
} from "./board";

let seq = 0;
function act(o: Partial<ActivityDetail> & Pick<ActivityDetail, "date" | "type">): ActivityDetail {
  seq += 1;
  return {
    id: `a-${seq}`,
    startTime: null,
    durationSec: null,
    notes: null,
    feel: null,
    distanceM: null,
    avgHeartRate: null,
    templateId: null,
    createdAt: `2026-01-01T00:00:${String(seq % 60).padStart(2, "0")}Z`,
    updatedAt: "2026-01-01T00:00:00Z",
    exercises: [],
    ...o,
  };
}

const set = (o: { reps?: number | null; durationSec?: number | null; weightKg?: number | null } = {}) => ({
  setNumber: 1,
  reps: o.reps ?? null,
  durationSec: o.durationSec ?? null,
  weightKg: o.weightKg ?? null,
});

const exercise = (sets: ReturnType<typeof set>[], name = "Squat") => ({
  id: `ae-${name}`,
  position: 0,
  notes: null,
  exercise: { id: `ex-${name}`, name, tracking: "reps" as const, custom: false },
  sets,
});

describe("ranges", () => {
  // 2026-11-25 is a Wednesday.
  it("week starts on Monday by default", () => {
    expect(startOfWeek("2026-11-25", 1)).toBe("2026-11-23");
    expect(resolveRange("week", "2026-11-25", 1)).toMatchObject({ start: "2026-11-23", end: "2026-11-29", from: "2026-11-23", to: "2026-11-29" });
  });

  it("week start follows user_settings.week_starts_on", () => {
    expect(resolveRange("week", "2026-11-25", 0)).toMatchObject({ start: "2026-11-22", end: "2026-11-28" });
    expect(resolveRange("week", "2026-11-25", 6)).toMatchObject({ start: "2026-11-21", end: "2026-11-27" });
    expect(resolveRange("week", "2026-11-25", 3)).toMatchObject({ start: "2026-11-25", end: "2026-12-01" });
    // A Sunday with Monday weeks belongs to the week that started six days before.
    expect(startOfWeek("2026-11-29", 1)).toBe("2026-11-23");
  });

  it("day is just the day", () => {
    expect(resolveRange("day", "2026-11-25", 1)).toEqual({
      view: "day",
      date: "2026-11-25",
      start: "2026-11-25",
      end: "2026-11-25",
      from: "2026-11-25",
      to: "2026-11-25",
    });
  });

  it("months are padded to whole weeks", () => {
    // Nov 2026: Sun 1 .. Mon 30.
    const mon = resolveRange("month", "2026-11-25", 1);
    expect(mon).toMatchObject({ start: "2026-11-01", end: "2026-11-30", from: "2026-10-26", to: "2026-12-06" });
    expect(eachDate(mon.from, mon.to)).toHaveLength(42);

    const sun = resolveRange("month", "2026-11-25", 0);
    expect(sun).toMatchObject({ from: "2026-11-01", to: "2026-12-05" });
    expect(eachDate(sun.from, sun.to)).toHaveLength(35);

    // Feb 2027 starts on a Monday and has exactly 4 weeks: no padding.
    expect(resolveRange("month", "2027-02-10", 1)).toMatchObject({ from: "2027-02-01", to: "2027-02-28" });
  });

  it("month ends, leap years and month arithmetic", () => {
    expect(endOfMonth("2028-02-03")).toBe("2028-02-29");
    expect(endOfMonth("2026-12-31")).toBe("2026-12-31");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("prev / next", () => {
    expect(shiftDate("day", "2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDate("week", "2026-11-25", -1)).toBe("2026-11-18");
    expect(shiftDate("month", "2026-03-31", -1)).toBe("2026-02-28");
  });

  it("normalizes week_starts_on", () => {
    expect(normalizeWeekStart(0)).toBe(0);
    expect(normalizeWeekStart(6)).toBe(6);
    expect(normalizeWeekStart(7)).toBe(1);
    expect(normalizeWeekStart(null)).toBe(1);
  });
});

describe("aggregation", () => {
  const week = resolveRange("week", "2026-11-25", 1);

  it("sums several activities on one day, by type, in time order", () => {
    const days = aggregateDays(
      [
        act({ date: "2026-11-24", type: "strength", startTime: "18:40", durationSec: 43 * 60 }),
        act({ date: "2026-11-24", type: "running", startTime: "07:15", durationSec: 31 * 60 + 4, distanceM: 5200 }),
        act({ date: "2026-11-24", type: "walking", durationSec: 20 * 60, distanceM: 1500 }),
        act({ date: "2026-11-24", type: "running", startTime: "12:00", durationSec: 10 * 60, distanceM: 2000 }),
      ],
      week,
    );
    expect(days).toHaveLength(7);
    const tue = days.find((d) => d.date === "2026-11-24")!;
    expect(tue.minutesByType).toEqual({ running: 41, walking: 20, strength: 43 });
    expect(tue.minutes).toBe(104);
    expect(tue.distanceM).toEqual({ running: 7200, walking: 1500 });
    expect(tue.activities.map((a) => [a.startTime, a.type])).toEqual([
      ["07:15", "running"],
      ["12:00", "running"],
      ["18:40", "strength"],
      [null, "walking"],
    ]);
    expect(days.find((d) => d.date === "2026-11-23")!.activities).toEqual([]);
  });

  it("strength without a total duration counts its set times, else 0", () => {
    const days = aggregateDays(
      [
        act({
          date: "2026-11-25",
          type: "strength",
          exercises: [exercise([set({ durationSec: 60 }), set({ durationSec: 45 })], "Plank"), exercise([set({ reps: 8, weightKg: 40 })])],
        }),
        act({ date: "2026-11-26", type: "strength", exercises: [exercise([set({ reps: 8 }), set({ reps: 8 })])] }),
      ],
      week,
    );
    const wed = days.find((d) => d.date === "2026-11-25")!;
    expect(wed.minutesByType.strength).toBe(2); // 105 s
    expect(wed.activities[0]).toMatchObject({ durationSec: 105, exerciseCount: 2, setCount: 3, title: "STRENGTH" });

    const thu = days.find((d) => d.date === "2026-11-26")!;
    expect(thu.minutes).toBe(0);
    expect(thu.activities[0]!.durationSec).toBeNull();
  });

  it("ignores activities outside the range", () => {
    const days = aggregateDays([act({ date: "2026-11-30", type: "running", durationSec: 600 })], week);
    expect(days.every((d) => d.activities.length === 0)).toBe(true);
  });

  it("month totals skip the padding days", () => {
    const month = resolveRange("month", "2026-11-25", 1);
    const board = buildBoard({
      range: month,
      today: "2026-11-25",
      activities: [
        act({ date: "2026-10-31", type: "running", durationSec: 1800, distanceM: 5000 }), // padding
        act({ date: "2026-11-01", type: "running", durationSec: 1800, distanceM: 5000 }),
        act({ date: "2026-11-01", type: "walking", durationSec: 600, distanceM: 1000 }),
        act({ date: "2026-11-02", type: "strength", durationSec: 2400 }),
        act({ date: "2026-12-01", type: "walking", durationSec: 600 }), // padding
      ],
      streakDates: [],
    });
    expect(board.days).toHaveLength(42);
    expect(board.days[0]).toMatchObject({ date: "2026-10-26", inPeriod: false });
    expect(board.days.find((d) => d.date === "2026-10-31")!.activities).toHaveLength(1);
    expect(board.totals).toEqual({
      activeDays: 2,
      minutes: 80,
      workouts: 3,
      runs: 1,
      walks: 1,
      strength: 1,
      distanceM: { running: 5000, walking: 1000 },
      volumeKg: 0,
    });
  });

  it("strength volume is weight × reps over sets with both", () => {
    const lift = act({
      date: "2026-11-24",
      type: "strength",
      exercises: [
        exercise([set({ reps: 8, weightKg: 40 }), set({ reps: 6, weightKg: 42.5 })], "Squat"),
        exercise([set({ reps: 10 }), set({ durationSec: 45, weightKg: 10 })], "Plank"), // BW + timed: 0
      ],
    });
    expect(strengthVolumeKg(lift)).toBe(575);
    const days = aggregateDays([lift, act({ date: "2026-11-24", type: "running", durationSec: 600 })], week);
    expect(days.find((d) => d.date === "2026-11-24")!.volumeKg).toBe(575);
    expect(totalize(days).volumeKg).toBe(575);
  });
});

describe("year view", () => {
  it("runs 1 Jan to 31 Dec, unpadded", () => {
    expect(resolveRange("year", "2026-11-25", 1)).toEqual({
      view: "year",
      date: "2026-11-25",
      start: "2026-01-01",
      end: "2026-12-31",
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("steps a year at a time (29 Feb clamps)", () => {
    expect(shiftDate("year", "2026-01-01", -1)).toBe("2025-01-01");
    expect(shiftDate("year", "2028-02-29", 1)).toBe("2029-02-28");
  });

  it("breaks the year down into twelve months", () => {
    const year = resolveRange("year", "2026-06-15", 1);
    const board = buildBoard({
      range: year,
      today: "2026-06-15",
      activities: [
        act({ date: "2026-01-05", type: "running", durationSec: 1800, distanceM: 5000 }),
        act({ date: "2026-01-06", type: "running", durationSec: 1200, distanceM: 3000 }),
        act({
          date: "2026-03-10",
          type: "strength",
          durationSec: 2400,
          exercises: [exercise([set({ reps: 5, weightKg: 60 })])],
        }),
        act({ date: "2026-12-31", type: "walking", durationSec: 600, distanceM: 1000 }),
      ],
      streakDates: [],
    });
    expect(board.days).toHaveLength(365);
    expect(board.totals).toMatchObject({ workouts: 4, runs: 2, strength: 1, walks: 1, minutes: 100, volumeKg: 300 });
    expect(board.streaks.longest).toBe(2);

    const months = monthlyBreakdown(board);
    expect(months.map((m) => m.month)).toEqual(eachDate("2026-01-01", "2026-12-31").filter((d) => d.endsWith("-01")));
    expect(months[0]).toMatchObject({
      workouts: 2,
      activeDays: 2,
      minutes: 50,
      minutesByType: { running: 50, walking: 0, strength: 0 },
      distanceM: { running: 8000, walking: 0 },
    });
    expect(months[1]).toMatchObject({ workouts: 0, minutes: 0, volumeKg: 0 });
    expect(months[2]).toMatchObject({ strength: 1, volumeKg: 300, minutesByType: { strength: 40 } });
    expect(months[11]).toMatchObject({ walks: 1, distanceM: { walking: 1000 } });
  });
});

describe("streaks", () => {
  const dates = ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-24", "2026-11-25"];

  it("current streak ends at the reference day", () => {
    expect(currentStreak(dates, "2026-11-25", "2026-11-25")).toBe(2);
    expect(currentStreak(dates, "2026-11-22", "2026-11-25")).toBe(3);
    expect(currentStreak(dates, "2026-11-23", "2026-11-25")).toBe(0);
  });

  it("an empty today keeps yesterday's streak alive", () => {
    expect(currentStreak(dates, "2026-11-26", "2026-11-26")).toBe(2);
    expect(currentStreak(dates, "2026-11-27", "2026-11-27")).toBe(0);
    expect(currentStreak([], "2026-11-26", "2026-11-26")).toBe(0);
  });

  it("streaks cross month and year boundaries", () => {
    expect(currentStreak(["2026-12-30", "2026-12-31", "2027-01-01"], "2027-01-01", "2027-01-01")).toBe(3);
  });

  it("longest streak within the period", () => {
    expect(longestStreak(dates, "2026-11-01", "2026-11-30")).toBe(3);
    expect(longestStreak(dates, "2026-11-21", "2026-11-25")).toBe(2);
    expect(longestStreak([], "2026-11-01", "2026-11-30")).toBe(0);
  });

  it("reference day per view", () => {
    const week = resolveRange("week", "2026-11-25", 1);
    expect(streakReferenceDay(week, "2026-11-25")).toBe("2026-11-25");
    expect(streakReferenceDay(week, "2026-12-10")).toBe("2026-11-29");
    expect(streakReferenceDay(resolveRange("day", "2026-11-02", 1), "2026-11-25")).toBe("2026-11-02");
    expect(streakWindow(week, "2026-11-25")).toEqual({ from: "2025-10-21", to: "2026-11-25" });
    expect(STREAK_LOOKBACK_DAYS).toBe(400);
  });

  it("buildBoard combines lookback dates with the range", () => {
    const board = buildBoard({
      range: resolveRange("day", "2026-11-25", 1),
      today: "2026-11-25",
      activities: [act({ date: "2026-11-25", type: "running", durationSec: 1860 })],
      streakDates: ["2026-11-23", "2026-11-24"],
    });
    expect(board.streaks).toEqual({ current: 3, longest: 1 });
    expect(board.totals.minutes).toBe(31);
  });
});

describe("home ledger numbers", () => {
  it("today, this week so far (across a month boundary), this month", () => {
    // Tue 1 Dec 2026: the week started Mon 30 Nov.
    const board = buildBoard({
      range: resolveRange("month", "2026-12-01", 1),
      today: "2026-12-01",
      activities: [
        act({ date: "2026-11-29", type: "running", durationSec: 600 }), // last week
        act({ date: "2026-11-30", type: "running", durationSec: 1800 }),
        act({ date: "2026-12-01", type: "strength", durationSec: 2580 }),
        act({ date: "2026-12-01", type: "walking", durationSec: 1860 }),
      ],
      streakDates: [],
    });
    expect(homeLedgerNumbers(board, 1)).toEqual({ day: 74, week: 104, month: 2 });
  });
});
