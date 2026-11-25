import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { activityInputSchema, activityRangeSchema, fieldErrors } from "@/lib/validation/activities";
import { customExerciseSchema, exerciseSearchSchema } from "@/lib/validation/exercises";

const today = "2026-11-25";
const schema = activityInputSchema(today);

const run = (o: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  type: "running",
  date: "2026-11-24",
  durationSec: 1864,
  distanceM: 5200,
  avgHeartRate: 152,
  ...o,
});

const lift = (o: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  type: "strength",
  date: "2026-11-24",
  exercises: [{ exerciseId: randomUUID(), sets: [{ reps: 8, weightKg: 40 }] }],
  ...o,
});

const errorsOf = (input: unknown) => {
  const r = schema.safeParse(input);
  return r.success ? {} : fieldErrors(r.error);
};

describe("running / walking", () => {
  it("accepts a full run and normalises optional fields to null", () => {
    const r = schema.parse(run({ notes: "  ", feel: undefined }));
    expect(r).toMatchObject({ type: "running", notes: null, feel: null, startTime: null, templateId: null });
  });

  it("requires duration within 1..86400", () => {
    expect(errorsOf(run({ durationSec: undefined }))).toHaveProperty("durationSec");
    expect(errorsOf(run({ durationSec: 0 }))).toHaveProperty("durationSec");
    expect(errorsOf(run({ durationSec: 86_401 }))).toHaveProperty("durationSec");
    expect(errorsOf(run({ durationSec: 86_400 }))).toEqual({});
  });

  it("bounds distance and heart rate", () => {
    expect(errorsOf(run({ distanceM: 200_001 }))).toHaveProperty("distanceM");
    expect(errorsOf(run({ distanceM: 0 }))).toHaveProperty("distanceM");
    expect(errorsOf(run({ distanceM: null }))).toEqual({});
    expect(errorsOf(run({ avgHeartRate: 29 }))).toHaveProperty("avgHeartRate");
    expect(errorsOf(run({ avgHeartRate: 231 }))).toHaveProperty("avgHeartRate");
    expect(errorsOf(run({ avgHeartRate: 152.5 }))).toHaveProperty("avgHeartRate");
  });

  it("caps notes at 2000 characters", () => {
    expect(errorsOf(run({ notes: "x".repeat(2001) }))).toHaveProperty("notes");
    expect(errorsOf(run({ notes: "x".repeat(2000) }))).toEqual({});
  });

  it("rejects exercises and unknown keys on a run", () => {
    expect(errorsOf(run({ exercises: [] }))).not.toEqual({});
    expect(errorsOf(run({ userId: randomUUID() }))).not.toEqual({});
  });

  it("validates feel and start time", () => {
    expect(errorsOf(run({ feel: "meh" }))).toHaveProperty("feel");
    expect(schema.parse(run({ feel: "spicy", startTime: "07:15:30" }))).toMatchObject({
      feel: "spicy",
      startTime: "07:15",
    });
    expect(errorsOf(run({ startTime: "25:00" }))).toHaveProperty("startTime");
  });
});

describe("dates", () => {
  it("allows up to 1 day in the future, relative to the user's today", () => {
    expect(errorsOf(run({ date: "2026-11-26" }))).toEqual({});
    expect(errorsOf(run({ date: "2026-11-27" }))).toHaveProperty("date");
    expect(errorsOf(run({ date: "2020-01-01" }))).toEqual({});
  });
  it("rejects impossible dates", () => {
    expect(errorsOf(run({ date: "2026-02-30" }))).toHaveProperty("date");
  });
});

describe("strength", () => {
  it("accepts reps-only, time-only and weighted sets; duration optional", () => {
    const r = schema.parse(
      lift({
        exercises: [
          { exerciseId: randomUUID(), sets: [{ reps: 8, weightKg: 42.5 }, { reps: 8 }] },
          { exerciseId: randomUUID(), sets: [{ durationSec: 60 }, { durationSec: 45, weightKg: 0 }] },
        ],
      }),
    );
    expect(r.type).toBe("strength");
    if (r.type === "strength") {
      expect(r.durationSec).toBeNull();
      expect(r.exercises[0]!.sets[1]).toEqual({ reps: 8, durationSec: null, weightKg: null });
    }
  });

  it("needs at least one exercise and one set", () => {
    expect(errorsOf(lift({ exercises: [] }))).toHaveProperty("exercises");
    expect(errorsOf(lift({ exercises: [{ exerciseId: randomUUID(), sets: [] }] }))).toHaveProperty(
      "exercises.0.sets",
    );
  });

  it("needs reps or time on every set", () => {
    expect(
      errorsOf(lift({ exercises: [{ exerciseId: randomUUID(), sets: [{ reps: 5 }, { weightKg: 20 }] }] })),
    ).toHaveProperty("exercises.0.sets.1.reps");
  });

  it("bounds reps, set time and weight", () => {
    const set = (s: Record<string, unknown>) => errorsOf(lift({ exercises: [{ exerciseId: randomUUID(), sets: [s] }] }));
    expect(set({ reps: 501 })).toHaveProperty("exercises.0.sets.0.reps");
    expect(set({ reps: 0 })).toHaveProperty("exercises.0.sets.0.reps");
    expect(set({ durationSec: 3601 })).toHaveProperty("exercises.0.sets.0.durationSec");
    expect(set({ reps: 5, weightKg: -1 })).toHaveProperty("exercises.0.sets.0.weightKg");
    expect(set({ reps: 5, weightKg: 1000.25 })).toHaveProperty("exercises.0.sets.0.weightKg");
    expect(set({ reps: 5, weightKg: 20.123 })).toHaveProperty("exercises.0.sets.0.weightKg");
    expect(set({ reps: 5, weightKg: 20.41 })).toEqual({});
  });

  it("rejects cardio fields on strength", () => {
    expect(errorsOf(lift({ distanceM: 100 }))).not.toEqual({});
    expect(errorsOf(lift({ avgHeartRate: 120 }))).not.toEqual({});
  });

  it("requires uuids", () => {
    expect(errorsOf(lift({ id: "nope" }))).toHaveProperty("id");
    expect(errorsOf(lift({ exercises: [{ exerciseId: "squat", sets: [{ reps: 1 }] }] }))).toHaveProperty(
      "exercises.0.exerciseId",
    );
  });
});

describe("range query", () => {
  it("needs from <= to within 400 days", () => {
    expect(activityRangeSchema.safeParse({ from: "2026-11-01", to: "2026-11-30" }).success).toBe(true);
    expect(activityRangeSchema.safeParse({ from: "2026-11-30", to: "2026-11-01" }).success).toBe(false);
    expect(activityRangeSchema.safeParse({ from: "2024-01-01", to: "2026-01-01" }).success).toBe(false);
    expect(activityRangeSchema.safeParse({ from: "x", to: "2026-01-01" }).success).toBe(false);
  });
});

describe("exercises", () => {
  it("parses search params with defaults", () => {
    expect(exerciseSearchSchema.parse({ q: "squt", muscle: "", equipment: null })).toEqual({
      q: "squt",
      limit: 30,
    });
    expect(exerciseSearchSchema.parse({ muscle: "glutes", equipment: "barbell", limit: "5" })).toMatchObject({
      muscle: "glutes",
      equipment: "barbell",
      limit: 5,
    });
    expect(exerciseSearchSchema.safeParse({ muscle: "toes" }).success).toBe(false);
    expect(exerciseSearchSchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("validates custom exercises", () => {
    expect(customExerciseSchema.parse({ name: "  Hip Thrust  " })).toEqual({
      name: "Hip Thrust",
      tracking: "reps",
      equipment: null,
      primaryMuscles: [],
    });
    expect(customExerciseSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(customExerciseSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
    expect(customExerciseSchema.safeParse({ name: "Wall sit", tracking: "time", source: "free-exercise-db" }).success).toBe(
      false,
    );
  });
});
