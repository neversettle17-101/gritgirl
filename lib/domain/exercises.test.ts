import { describe, expect, it } from "vitest";
import { freeExerciseRecordSchema } from "@/lib/validation/free-exercise-db";
import { mapFreeExercise, trackingFor } from "./exercises";

const plank = {
  id: "Plank",
  name: "Plank",
  force: "static",
  level: "beginner",
  mechanic: "isolation",
  equipment: "body only",
  primaryMuscles: ["abdominals"],
  secondaryMuscles: [],
  instructions: ["Get into a prone position on the floor."],
  category: "strength",
  images: ["Plank/0.jpg", "Plank/1.jpg"],
};

describe("trackingFor", () => {
  it("tracks static holds by time", () => {
    expect(trackingFor({ force: "static" })).toBe("time");
  });
  it("tracks push/pull and unknown force by reps", () => {
    expect(trackingFor({ force: "push" })).toBe("reps");
    expect(trackingFor({ force: "pull" })).toBe("reps");
    expect(trackingFor({ force: null })).toBe("reps");
    expect(trackingFor({})).toBe("reps");
  });
});

describe("freeExerciseRecordSchema", () => {
  it("accepts an upstream record", () => {
    expect(freeExerciseRecordSchema.safeParse(plank).success).toBe(true);
  });
  it("defaults missing arrays and allows null optional fields", () => {
    const r = freeExerciseRecordSchema.parse({ id: "X", name: "X", force: null, equipment: null });
    expect(r.primaryMuscles).toEqual([]);
    expect(r.images).toEqual([]);
  });
  it("rejects records without an id or name", () => {
    expect(freeExerciseRecordSchema.safeParse({ ...plank, id: "" }).success).toBe(false);
    expect(freeExerciseRecordSchema.safeParse({ ...plank, name: undefined }).success).toBe(false);
  });
  it("rejects unknown force values", () => {
    expect(freeExerciseRecordSchema.safeParse({ ...plank, force: "twist" }).success).toBe(false);
  });
  it("rejects absolute or traversal image paths", () => {
    for (const p of ["/etc/passwd", "../x.jpg", "https://example.com/a.jpg"]) {
      expect(freeExerciseRecordSchema.safeParse({ ...plank, images: [p] }).success).toBe(false);
    }
  });
});

describe("mapFreeExercise", () => {
  it("maps to a library row", () => {
    const row = mapFreeExercise(freeExerciseRecordSchema.parse(plank));
    expect(row).toEqual({
      ownerUserId: null,
      source: "free-exercise-db",
      sourceId: "Plank",
      name: "Plank",
      category: "strength",
      equipment: "body only",
      primaryMuscles: ["abdominals"],
      secondaryMuscles: [],
      instructions: ["Get into a prone position on the floor."],
      imagePaths: ["Plank/0.jpg", "Plank/1.jpg"],
      tracking: "time",
    });
  });
  it("dedupes muscles and drops blank instructions", () => {
    const row = mapFreeExercise(
      freeExerciseRecordSchema.parse({
        ...plank,
        force: "push",
        primaryMuscles: ["chest", "chest "],
        instructions: ["a", "  ", "b"],
      }),
    );
    expect(row.primaryMuscles).toEqual(["chest"]);
    expect(row.instructions).toEqual(["a", "b"]);
    expect(row.tracking).toBe("reps");
  });
});
