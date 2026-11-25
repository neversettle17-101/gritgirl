import { describe, expect, it } from "vitest";
import type { ActivityDetail } from "./activity-types";
import {
  activityToDraft,
  addExercise,
  addSet,
  draftHasContent,
  draftToPayload,
  draftTotals,
  moveExercise,
  moveSet,
  newDraft,
  parseStoredDraft,
  removeExercise,
  removeSet,
  startTimer,
  stopTimer,
  summarizeDraftExercise,
  summarizeSets,
  updateSet,
  type StrengthDraft,
} from "./strength-draft";
import { activityInputSchema } from "@/lib/validation/activities";

const ID = "11111111-1111-4111-8111-111111111111";
const SQUAT = { id: "22222222-2222-4222-8222-222222222222", name: "Barbell Squat", tracking: "reps" as const };
const PLANK = { id: "33333333-3333-4333-8333-333333333333", name: "Plank", tracking: "time" as const };

function keys() {
  let n = 0;
  return () => `k${++n}`;
}

function base(unit: "kg" | "lb" = "kg"): StrengthDraft {
  return newDraft({ id: ID, date: "2026-11-24", startTime: "18:40", weightUnit: unit });
}

/** squat 2 sets (8×40, 8×42.5) + plank 2 sets (60s, 45s) */
function filled(unit: "kg" | "lb" = "kg") {
  const key = keys();
  let d = addExercise(base(unit), SQUAT, key);
  const sq = d.exercises[0]!;
  d = updateSet(d, sq.key, sq.sets[0]!.key, { reps: "8", weight: "40" });
  d = addSet(d, sq.key, key());
  d = updateSet(d, sq.key, d.exercises[0]!.sets[1]!.key, { weight: "42.5" });
  d = addExercise(d, PLANK, key);
  const pl = d.exercises[1]!;
  d = updateSet(d, pl.key, pl.sets[0]!.key, { time: "60" });
  d = addSet(d, pl.key, key());
  d = updateSet(d, pl.key, d.exercises[1]!.sets[1]!.key, { time: "0:45" });
  return d;
}

describe("editing the draft", () => {
  it("a new set copies the previous set", () => {
    const d = filled();
    expect(d.exercises[0]!.sets.map((s) => [s.reps, s.weight])).toEqual([
      ["8", "40"],
      ["8", "42.5"],
    ]);
    expect(d.exercises[0]!.sets[0]!.key).not.toBe(d.exercises[0]!.sets[1]!.key);
  });

  it("adds an exercise pre-filled from last time", () => {
    const d = addExercise(base("lb"), SQUAT, keys(), {
      activityId: ID,
      date: "2026-11-01",
      sets: [
        { setNumber: 1, reps: 5, durationSec: null, weightKg: 20.41 },
        { setNumber: 2, reps: 5, durationSec: null, weightKg: null },
      ],
    });
    expect(d.exercises[0]!.sets.map((s) => [s.reps, s.time, s.weight])).toEqual([
      ["5", "", "45"],
      ["5", "", ""],
    ]);
  });

  it("reorders and removes exercises and sets", () => {
    let d = filled();
    const [sq, pl] = d.exercises;
    d = moveExercise(d, pl!.key, -1);
    expect(d.exercises.map((e) => e.name)).toEqual(["Plank", "Barbell Squat"]);
    expect(moveExercise(d, pl!.key, -1)).toEqual(d); // already first: no-op

    d = moveSet(d, sq!.key, sq!.sets[1]!.key, -1);
    expect(d.exercises[1]!.sets.map((s) => s.weight)).toEqual(["42.5", "40"]);

    d = removeSet(d, sq!.key, sq!.sets[0]!.key);
    expect(d.exercises[1]!.sets).toHaveLength(1);
    d = removeExercise(d, pl!.key);
    expect(d.exercises.map((e) => e.name)).toEqual(["Barbell Squat"]);
  });

  it("totals items and sets", () => {
    expect(draftTotals(filled())).toEqual({ items: 2, sets: 4 });
  });
});

describe("compact line", () => {
  it("summarises sets × reps × weight", () => {
    const d = filled();
    expect(summarizeDraftExercise(d.exercises[0]!)).toEqual({ setCount: 2, line: "2 × 8 reps", weight: "40–42.5" });
    expect(summarizeDraftExercise(d.exercises[1]!)).toEqual({ setCount: 2, line: "2 sets · 1:00/45s", weight: "BW" });
  });

  it("handles mixed reps and uniform times", () => {
    expect(
      summarizeSets(
        [
          { reps: 10, durationSec: null, weight: 40 },
          { reps: 8, durationSec: null, weight: 40 },
          { reps: 6, durationSec: null, weight: 40 },
        ],
        "reps",
      ),
    ).toEqual({ setCount: 3, line: "3 sets · 10/8/6 reps", weight: "40" });
    expect(summarizeSets([{ reps: null, durationSec: 60, weight: null }, { reps: null, durationSec: 60, weight: null }], "time").line).toBe(
      "2 × 1:00",
    );
    // A reps exercise logged only by time still shows the time.
    expect(summarizeSets([{ reps: null, durationSec: 30, weight: null }], "reps").line).toBe("1 × 30s");
    expect(summarizeSets([], "reps").line).toBe("no sets yet");
  });
});

describe("draftToPayload", () => {
  it("maps to the SI API document in order", () => {
    const r = draftToPayload({ ...filled(), duration: "43 min", feel: "solid", notes: " felt strong " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({
      id: ID,
      type: "strength",
      date: "2026-11-24",
      startTime: "18:40",
      durationSec: 2580,
      notes: "felt strong",
      feel: "solid",
      templateId: null,
      exercises: [
        {
          exerciseId: SQUAT.id,
          notes: null,
          sets: [
            { reps: 8, durationSec: null, weightKg: 40 },
            { reps: 8, durationSec: null, weightKg: 42.5 },
          ],
        },
        {
          exerciseId: PLANK.id,
          notes: null,
          sets: [
            { reps: null, durationSec: 60, weightKg: null },
            { reps: null, durationSec: 45, weightKg: null },
          ],
        },
      ],
    });
    // …and it passes the API schema unchanged.
    expect(activityInputSchema("2026-11-25").safeParse(r.payload).success).toBe(true);
  });

  it("converts lb to kg", () => {
    let d = addExercise(base("lb"), SQUAT, keys());
    d = updateSet(d, d.exercises[0]!.key, d.exercises[0]!.sets[0]!.key, { reps: "5", weight: "135" });
    const r = draftToPayload(d);
    expect(r.ok && r.payload.exercises[0]!.sets[0]!.weightKg).toBe(61.23);
  });

  it("uses the timer when no total duration is typed, else null", () => {
    let d = startTimer(filled(), 1_000);
    const running = draftToPayload(d, 1_000 + 30 * 60_000);
    expect(running.ok && running.payload.durationSec).toBe(1800);

    d = stopTimer(d, 1_000 + 42 * 60_000 + 10_000);
    expect(d.duration).toBe("42:10");
    expect(d.timer.startedAt).toBeNull();

    const none = draftToPayload(filled());
    expect(none.ok && none.payload.durationSec).toBeNull();
  });

  it("reports field errors with API-style keys", () => {
    let d = filled();
    const sq = d.exercises[0]!;
    d = updateSet(d, sq.key, sq.sets[0]!.key, { reps: "", time: "" });
    d = updateSet(d, sq.key, sq.sets[1]!.key, { reps: "8.5", weight: "heavy" });
    d = { ...d, duration: "soon" };
    const r = draftToPayload(d);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toMatchObject({
      "exercises.0.sets.0.reps": expect.any(String),
      "exercises.0.sets.1.reps": expect.any(String),
      "exercises.0.sets.1.weightKg": expect.any(String),
      durationSec: expect.any(String),
    });
  });

  it("needs an exercise with a set", () => {
    const r = draftToPayload(base());
    expect(!r.ok && r.errors.exercises).toBeTruthy();
    let d = addExercise(base(), SQUAT, keys());
    d = removeSet(d, d.exercises[0]!.key, d.exercises[0]!.sets[0]!.key);
    const r2 = draftToPayload(d);
    expect(!r2.ok && r2.errors["exercises.0.sets"]).toBeTruthy();
  });
});

describe("edit round trip", () => {
  const saved: ActivityDetail = {
    id: ID,
    type: "strength",
    date: "2026-11-24",
    startTime: "18:40",
    durationSec: 2580,
    notes: "ok",
    feel: "spicy",
    distanceM: null,
    avgHeartRate: null,
    templateId: null,
    createdAt: "",
    updatedAt: "",
    exercises: [
      {
        id: "a",
        position: 1,
        notes: null,
        exercise: { ...SQUAT, custom: false },
        sets: [{ setNumber: 1, reps: 8, durationSec: null, weightKg: 61.23 }],
      },
      {
        id: "b",
        position: 2,
        notes: null,
        exercise: { ...PLANK, custom: false },
        sets: [{ setNumber: 1, reps: null, durationSec: 90, weightKg: null }],
      },
    ],
  };

  it("activity → draft → payload keeps the data", () => {
    const d = activityToDraft(saved, "kg", keys());
    expect(d.mode).toBe("edit");
    expect(d.duration).toBe("43:00");
    const r = draftToPayload(d);
    expect(r.ok && r.payload.exercises.map((e) => e.sets)).toEqual([
      [{ reps: 8, durationSec: null, weightKg: 61.23 }],
      [{ reps: null, durationSec: 90, weightKg: null }],
    ]);
    expect(r.ok && r.payload.durationSec).toBe(2580);
  });

  it("round-trips through lb without drift", () => {
    const d = activityToDraft(saved, "lb", keys());
    expect(d.exercises[0]!.sets[0]!.weight).toBe("135");
    const r = draftToPayload(d);
    expect(r.ok && r.payload.exercises[0]!.sets[0]!.weightKg).toBe(61.23);
  });
});

describe("storage", () => {
  it("parses only current, well-formed drafts", () => {
    const d = filled();
    expect(parseStoredDraft(JSON.stringify(d))).toEqual(d);
    expect(parseStoredDraft(null)).toBeNull();
    expect(parseStoredDraft("{not json")).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ ...d, version: 0 }))).toBeNull();
  });
  it("knows when a draft is empty", () => {
    expect(draftHasContent(base())).toBe(false);
    expect(draftHasContent(filled())).toBe(true);
    expect(draftHasContent(startTimer(base(), 1))).toBe(true);
  });
});
