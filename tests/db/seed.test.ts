import { and, count, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { exercises } from "@/lib/db/schema";
import { prepareRows, readVendoredExercises, seedExercises } from "@/lib/db/seed-exercises";
import { connect } from "./helpers";

const { db, close } = connect();
afterAll(close);

const librarySize = () =>
  db
    .select({ n: count() })
    .from(exercises)
    .where(eq(exercises.source, "free-exercise-db"))
    .then(([r]) => r!.n);

describe("seed-exercises", () => {
  it("is idempotent: running twice never duplicates or rewrites rows", async () => {
    const raw = await readVendoredExercises();
    const { rows } = prepareRows(raw);

    const first = await seedExercises(db, raw);
    expect(first.skipped).toEqual([]);
    expect(first.inserted + first.updated + first.unchanged).toBe(rows.length);
    const afterFirst = await librarySize();

    const second = await seedExercises(db, raw);
    expect(second).toMatchObject({ inserted: 0, updated: 0, unchanged: rows.length });
    expect(await librarySize()).toBe(afterFirst);
    expect(afterFirst).toBeGreaterThanOrEqual(rows.length);
  });

  it("updates a row in place when upstream data changes", async () => {
    const raw = (await readVendoredExercises()) as { id: string; name: string }[];
    const tweaked = raw.map((r) => (r.id === "Plank" ? { ...r, name: "Plank (renamed)" } : r));
    const res = await seedExercises(db, tweaked);
    expect(res).toMatchObject({ inserted: 0, updated: 1 });
    const restore = await seedExercises(db, raw);
    expect(restore).toMatchObject({ inserted: 0, updated: 1 });
  });

  it("imports the expected fields for a sample of exercises", async () => {
    const [plank] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.source, "free-exercise-db"), eq(exercises.sourceId, "Plank")));
    expect(plank).toMatchObject({
      name: "Plank",
      ownerUserId: null,
      category: "strength",
      tracking: "time",
    });
    expect(plank!.primaryMuscles).toContain("abdominals");
    expect(plank!.imagePaths[0]).toMatch(/^Plank\/0\.jpg$/);

    const [squat] = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.source, "free-exercise-db"), eq(exercises.name, "Barbell Squat")));
    expect(squat).toMatchObject({ tracking: "reps", equipment: "barbell" });
    expect(squat!.instructions.length).toBeGreaterThan(0);
  });

  it("supports typo-tolerant search via pg_trgm", async () => {
    const rows = await db
      .select({ name: exercises.name })
      .from(exercises)
      .where(sql`${exercises.name} operator(extensions.%) ${"squt"}`)
      .orderBy(sql`extensions.similarity(${exercises.name}, ${"squt"}) desc`)
      .limit(10);
    expect(rows.some((r) => /squat/i.test(r.name))).toBe(true);
  });

  it("has a trigram index on exercises.name", async () => {
    const idx = await db.execute<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where schemaname = 'public' and indexname = 'exercises_name_trgm_idx'`,
    );
    expect(idx[0]?.indexdef).toMatch(/gin_trgm_ops/);
  });
});
