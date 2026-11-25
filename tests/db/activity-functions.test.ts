import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activities, activityExercises, exercises, exerciseSets } from "@/lib/db/schema";
import { asUser, connect, createUser, deleteUsers, expectPgError, RLS_VIOLATION } from "./helpers";

// save_activity / search_exercises / exercise_last_sets
// (db/migrations/20261125000004_activity_functions.sql), called exactly as
// the API calls them: as the signed-in user, through RLS.

const { db, close } = connect();

let alice: string;
let bob: string;
const squat = randomUUID();
const plank = randomUUID();
let aliceCustom: string;

type Tx = Parameters<Parameters<typeof asUser>[2]>[0];

function save(tx: Tx, doc: Record<string, unknown>, replace = false) {
  return tx.execute(
    sql`select public.save_activity(${JSON.stringify(doc)}::jsonb, ${replace}) as id`,
  );
}

async function children(activityId: string) {
  const aes = await db
    .select()
    .from(activityExercises)
    .where(eq(activityExercises.activityId, activityId))
    .orderBy(activityExercises.position);
  const sets = aes.length
    ? await db
        .select()
        .from(exerciseSets)
        .where(
          inArray(
            exerciseSets.activityExerciseId,
            aes.map((a) => a.id),
          ),
        )
        .orderBy(exerciseSets.activityExerciseId, exerciseSets.setNumber)
    : [];
  return { aes, sets };
}

const strengthDoc = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "strength",
  date: "2026-11-24",
  durationSec: 3120,
  notes: "felt strong",
  feel: "solid",
  exercises: [
    {
      exerciseId: squat,
      sets: [
        { reps: 8, weightKg: 40 },
        { reps: 8, weightKg: 42.5 },
      ],
    },
    { exerciseId: plank, sets: [{ durationSec: 60 }, { durationSec: 45 }] },
  ],
  ...overrides,
});

beforeAll(async () => {
  alice = await createUser(db, "alice-fn");
  bob = await createUser(db, "bob-fn");
  await db.insert(exercises).values([
    { id: squat, source: "free-exercise-db", sourceId: `fn-test-${squat}`, name: "Zz Fn Test Squat" },
    {
      id: plank,
      source: "free-exercise-db",
      sourceId: `fn-test-${plank}`,
      name: "Zz Fn Test Plank",
      tracking: "time",
    },
  ]);
  const [custom] = await asUser(db, alice, (tx) =>
    tx
      .insert(exercises)
      .values({ ownerUserId: alice, source: "custom", name: "Alice Fn Secret Lift" })
      .returning(),
  );
  aliceCustom = custom!.id;
});

afterAll(async () => {
  await deleteUsers(db, [alice, bob]);
  await db.delete(exercises).where(inArray(exercises.id, [squat, plank]));
  await close();
});

describe("save_activity: create", () => {
  it("creates a run with every cardio field", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) =>
      save(tx, {
        id,
        type: "running",
        date: "2026-11-24",
        startTime: "07:15",
        durationSec: 1864,
        distanceM: 5200,
        avgHeartRate: 152,
        feel: "spicy",
        notes: "hills",
      }),
    );
    const [row] = await db.select().from(activities).where(eq(activities.id, id));
    expect(row).toMatchObject({
      userId: alice,
      type: "running",
      startTime: "07:15:00",
      durationSec: 1864,
      distanceM: 5200,
      avgHeartRate: 152,
      feel: "spicy",
      notes: "hills",
    });
  });

  it("creates a strength workout with exercises and sets in order", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, strengthDoc(id)));
    const { aes, sets } = await children(id);
    expect(aes.map((a) => [a.position, a.exerciseId])).toEqual([
      [1, squat],
      [2, plank],
    ]);
    const bySquat = sets.filter((s) => s.activityExerciseId === aes[0]!.id);
    expect(bySquat.map((s) => [s.setNumber, s.reps, s.weightKg])).toEqual([
      [1, 8, 40],
      [2, 8, 42.5],
    ]);
    const byPlank = sets.filter((s) => s.activityExerciseId === aes[1]!.id);
    expect(byPlank.map((s) => [s.setNumber, s.reps, s.durationSec, s.weightKg])).toEqual([
      [1, null, 60, null],
      [2, null, 45, null],
    ]);
  });

  it("is all-or-nothing: a bad set in the last exercise leaves no rows behind", async () => {
    const id = randomUUID();
    const doc = strengthDoc(id, {
      exercises: [
        { exerciseId: squat, sets: [{ reps: 5, weightKg: 50 }] },
        { exerciseId: plank, sets: [{ weightKg: 10 }] }, // neither reps nor time
      ],
    });
    await expectPgError(
      asUser(db, alice, (tx) => save(tx, doc)),
      { code: "23514", constraint: "set_has_reps_or_time" },
    );
    expect(await db.select().from(activities).where(eq(activities.id, id))).toEqual([]);
    const orphans = await db
      .select()
      .from(activityExercises)
      .where(eq(activityExercises.activityId, id));
    expect(orphans).toEqual([]);
  });

  it("rejects a duplicate id (client-generated ids make retries safe)", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, strengthDoc(id)));
    await expectPgError(
      asUser(db, alice, (tx) => save(tx, strengthDoc(id))),
      { code: "23505" },
    );
  });

  it("rejects an unknown exercise with a foreign-key error", async () => {
    await expectPgError(
      asUser(db, alice, (tx) =>
        save(tx, strengthDoc(randomUUID(), { exercises: [{ exerciseId: randomUUID(), sets: [{ reps: 1 }] }] })),
      ),
      { code: "23503" },
    );
  });

  it("lets Alice use her own custom exercise", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) =>
      save(tx, strengthDoc(id, { exercises: [{ exerciseId: aliceCustom, sets: [{ reps: 3 }] }] })),
    );
    expect((await children(id)).aes[0]!.exerciseId).toBe(aliceCustom);
  });

  it("refuses when not signed in", async () => {
    await expectPgError(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role authenticated`);
        await save(tx, strengthDoc(randomUUID()));
      }),
      { code: RLS_VIOLATION },
    );
  });
});

describe("save_activity: replace", () => {
  it("replaces fields and every child row in one go", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, strengthDoc(id)));
    const before = await children(id);

    await asUser(db, alice, (tx) =>
      save(
        tx,
        strengthDoc(id, {
          durationSec: 2400,
          notes: null,
          feel: null,
          exercises: [{ exerciseId: plank, sets: [{ durationSec: 90 }, { durationSec: 75 }, { durationSec: 60 }] }],
        }),
        true,
      ),
    );

    const [row] = await db.select().from(activities).where(eq(activities.id, id));
    expect(row).toMatchObject({ durationSec: 2400, notes: null, feel: null });
    const after = await children(id);
    expect(after.aes).toHaveLength(1);
    expect(after.aes[0]!.exerciseId).toBe(plank);
    expect(after.sets.map((s) => s.durationSec)).toEqual([90, 75, 60]);
    // Old child rows are gone, not orphaned.
    const old = await db
      .select()
      .from(exerciseSets)
      .where(inArray(exerciseSets.activityExerciseId, before.aes.map((a) => a.id)));
    expect(old).toEqual([]);
  });

  it("a failed replace keeps the original workout intact", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, strengthDoc(id)));
    await expectPgError(
      asUser(db, alice, (tx) =>
        save(tx, strengthDoc(id, { exercises: [{ exerciseId: squat, sets: [{ reps: 0 }] }] }), true),
      ),
      { code: "23514" },
    );
    const { aes, sets } = await children(id);
    expect(aes).toHaveLength(2);
    expect(sets).toHaveLength(4);
  });

  it("can turn a strength workout into a run (children removed first)", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, strengthDoc(id)));
    await asUser(db, alice, (tx) =>
      save(tx, { id, type: "running", date: "2026-11-24", durationSec: 1800, distanceM: 5000 }, true),
    );
    const [row] = await db.select().from(activities).where(eq(activities.id, id));
    expect(row).toMatchObject({ type: "running", distanceM: 5000 });
    expect((await children(id)).aes).toEqual([]);
  });

  it("404s (P0002) for an id that does not exist", async () => {
    await expectPgError(
      asUser(db, alice, (tx) => save(tx, strengthDoc(randomUUID()), true)),
      { code: "P0002" },
    );
  });
});

describe("save_activity: RLS", () => {
  it("Bob cannot replace Alice's workout, and her rows survive", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, strengthDoc(id)));
    await expectPgError(
      asUser(db, bob, (tx) => save(tx, strengthDoc(id, { exercises: [] }), true)),
      { code: "P0002" },
    );
    expect((await children(id)).sets).toHaveLength(4);
  });

  it("Bob cannot create a workout under Alice's id", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, { id, type: "walking", date: "2026-11-24", durationSec: 600 }));
    await expectPgError(
      asUser(db, bob, (tx) => save(tx, { id, type: "walking", date: "2026-11-24", durationSec: 600 })),
      { code: "23505" },
    );
    const [row] = await db.select().from(activities).where(eq(activities.id, id));
    expect(row!.userId).toBe(alice);
  });

  it("Bob cannot attach Alice's custom exercise", async () => {
    await expectPgError(
      asUser(db, bob, (tx) =>
        save(tx, strengthDoc(randomUUID(), { exercises: [{ exerciseId: aliceCustom, sets: [{ reps: 1 }] }] })),
      ),
      { code: "23503" },
    );
  });

  it("Bob deleting Alice's workout affects nothing; Alice's delete cascades", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, strengthDoc(id)));
    const bobDeleted = await asUser(db, bob, (tx) =>
      tx.delete(activities).where(eq(activities.id, id)).returning(),
    );
    expect(bobDeleted).toEqual([]);

    const { aes } = await children(id);
    await asUser(db, alice, (tx) => tx.delete(activities).where(eq(activities.id, id)));
    expect(await db.select().from(activities).where(eq(activities.id, id))).toEqual([]);
    expect(
      await db.select().from(exerciseSets).where(inArray(exerciseSets.activityExerciseId, aes.map((a) => a.id))),
    ).toEqual([]);
  });
});

describe("search_exercises", () => {
  const search = (user: string, q: string | null, muscle: string | null = null, equipment: string | null = null) =>
    asUser(db, user, async (tx) => {
      const rows = await tx.execute<{ id: string; name: string }>(
        sql`select id, name from public.search_exercises(${q}, ${muscle}, ${equipment}, 50)`,
      );
      return [...rows];
    });

  it("is typo-tolerant", async () => {
    const rows = await search(alice, "fn test squt");
    expect(rows[0]?.id).toBe(squat);
  });

  it("only shows custom exercises to their owner", async () => {
    expect((await search(alice, "secret lift")).map((r) => r.id)).toContain(aliceCustom);
    expect((await search(bob, "secret lift")).map((r) => r.id)).not.toContain(aliceCustom);
  });

  it("treats LIKE wildcards in the query literally", async () => {
    const rows = await search(alice, "%%%");
    expect(rows).toEqual([]);
  });
});

describe("exercise_last_sets", () => {
  it("returns the caller's most recent sets for an exercise, or null", async () => {
    const older = randomUUID();
    const newer = randomUUID();
    await asUser(db, bob, async (tx) => {
      await save(tx, {
        id: older,
        type: "strength",
        date: "2026-10-01",
        exercises: [{ exerciseId: squat, sets: [{ reps: 5, weightKg: 30 }] }],
      });
      await save(tx, {
        id: newer,
        type: "strength",
        date: "2026-11-01",
        exercises: [{ exerciseId: squat, sets: [{ reps: 6, weightKg: 35 }, { reps: 6, weightKg: 35 }] }],
      });
    });
    const last = await asUser(db, bob, async (tx) => {
      const [r] = await tx.execute<{ last: unknown }>(sql`select public.exercise_last_sets(${squat}) as last`);
      return r!.last;
    });
    expect(last).toEqual({
      activityId: newer,
      date: "2026-11-01",
      sets: [
        { setNumber: 1, reps: 6, durationSec: null, weightKg: 35 },
        { setNumber: 2, reps: 6, durationSec: null, weightKg: 35 },
      ],
    });

    // Bob never logged a plank (Alice did), so he gets null, not her sets.
    const none = await asUser(db, bob, async (tx) => {
      const [r] = await tx.execute<{ last: unknown }>(sql`select public.exercise_last_sets(${plank}) as last`);
      return r!.last;
    });
    expect(none).toBeNull();
  });
});
