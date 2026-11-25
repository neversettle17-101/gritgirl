import { describe, expect, it } from "vitest";
import { prepareRows } from "@/lib/db/seed-exercises";
import vendored from "@/data/vendor/free-exercise-db/exercises.json";

describe("prepareRows", () => {
  it("skips and reports bad rows instead of failing", () => {
    const { rows, skipped } = prepareRows([
      { id: "A", name: "A" },
      { id: "", name: "no id" },
      { id: "A", name: "dup" },
      null,
    ]);
    expect(rows.map((r) => r.sourceId)).toEqual(["A"]);
    expect(skipped.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it("validates every vendored record", () => {
    const { rows, skipped, total } = prepareRows(vendored);
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(total);
    expect(total).toBeGreaterThan(800);
    const plank = rows.find((r) => r.sourceId === "Plank");
    expect(plank?.tracking).toBe("time");
    expect(rows.find((r) => r.name === "Barbell Squat")?.tracking).toBe("reps");
  });
});
