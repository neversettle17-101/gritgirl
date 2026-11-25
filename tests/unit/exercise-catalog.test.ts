import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EQUIPMENT, MUSCLES } from "@/lib/validation/exercises";

describe("search filter catalog", () => {
  const records = JSON.parse(
    readFileSync("data/vendor/free-exercise-db/exercises.json", "utf8"),
  ) as { primaryMuscles: string[]; equipment: string | null }[];

  it("lists every primary muscle in the library", () => {
    const muscles = [...new Set(records.flatMap((r) => r.primaryMuscles))].sort();
    expect([...MUSCLES]).toEqual(muscles);
  });

  it("lists every equipment value in the library", () => {
    const equipment = [...new Set(records.map((r) => r.equipment).filter((e): e is string => !!e))].sort();
    expect([...EQUIPMENT]).toEqual(equipment);
  });
});
