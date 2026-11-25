import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activities, exercises, templateExercises, workoutTemplates, workoutTemplateUsage } from "@/lib/db/schema";
import { asUser, connect, createUser, deleteUsers, expectPgError } from "./helpers";

// save_template (db/migrations/20261125000005_template_functions.sql), the
// archive behaviour and the derived usage counts, exercised exactly as the
// API does: as the signed-in user, through RLS.

const { db, close } = connect();

let alice: string;
let bob: string;
const squat = randomUUID();
const plank = randomUUID();
let aliceCustom: string;

type Tx = Parameters<Parameters<typeof asUser>[2]>[0];

function save(tx: Tx, doc: Record<string, unknown>, replace = false) {
  return tx.execute(sql`select public.save_template(${JSON.stringify(doc)}::jsonb, ${replace}) as id`);
}

function saveActivity(tx: Tx, doc: Record<string, unknown>) {
  return tx.execute(sql`select public.save_activity(${JSON.stringify(doc)}::jsonb, false) as id`);
}

const legDay = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "strength",
  name: "  Leg Day ",
  notes: "warm up first",
  exercises: [
    { exerciseId: squat, targetSets: 4, targetReps: 10, targetWeightKg: 40 },
    { exerciseId: plank, targetSets: 2, targetDurationSec: 60 },
  ],
  ...overrides,
});

const the5k = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "running",
  name: "The 5K",
  targetDistanceM: 5000,
  targetDurationSec: 1800,
  ...overrides,
});

async function items(templateId: string) {
  return db
    .select()
    .from(templateExercises)
    .where(eq(templateExercises.templateId, templateId))
    .orderBy(templateExercises.position);
}

beforeAll(async () => {
  alice = await createUser(db, "alice-tpl");
  bob = await createUser(db, "bob-tpl");
  await db.insert(exercises).values([
    { id: squat, source: "free-exercise-db", sourceId: `tpl-test-${squat}`, name: "Zz Tpl Test Squat" },
    { id: plank, source: "free-exercise-db", sourceId: `tpl-test-${plank}`, name: "Zz Tpl Test Plank", tracking: "time" },
  ]);
  const [custom] = await asUser(db, alice, (tx) =>
    tx.insert(exercises).values({ ownerUserId: alice, source: "custom", name: "Alice Tpl Secret Lift" }).returning(),
  );
  aliceCustom = custom!.id;
});

afterAll(async () => {
  await deleteUsers(db, [alice, bob]);
  await db.delete(exercises).where(inArray(exercises.id, [squat, plank]));
  await close();
});

describe("save_template: create", () => {
  it("creates a run regular with its targets", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, the5k(id)));
    const [row] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id));
    expect(row).toMatchObject({
      userId: alice,
      type: "running",
      name: "The 5K",
      targetDistanceM: 5000,
      targetDurationSec: 1800,
      archived: false,
    });
  });

  it("creates a strength regular with ordered exercises and targets (name trimmed)", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, legDay(id)));
    const [row] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id));
    expect(row).toMatchObject({ name: "Leg Day", notes: "warm up first", targetDistanceM: null });
    expect(
      (await items(id)).map((e) => [e.position, e.exerciseId, e.targetSets, e.targetReps, e.targetDurationSec, e.targetWeightKg]),
    ).toEqual([
      [1, squat, 4, 10, null, 40],
      [2, plank, 2, null, 60, null],
    ]);
  });

  it("accepts my own custom exercises", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, legDay(id, { exercises: [{ exerciseId: aliceCustom, targetSets: 3 }] })));
    expect((await items(id)).map((e) => e.exerciseId)).toEqual([aliceCustom]);
  });

  it("rejects someone else's custom exercise (23503)", async () => {
    await expectPgError(
      asUser(db, bob, (tx) => save(tx, legDay(randomUUID(), { exercises: [{ exerciseId: aliceCustom, targetSets: 3 }] }))),
      { code: "23503" },
    );
  });

  it("rejects a duplicate id (23505)", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, the5k(id)));
    await expectPgError(
      asUser(db, alice, (tx) => save(tx, the5k(id))),
      { code: "23505" },
    );
  });

  it("rejects cardio targets on a strength regular (constraint backstop)", async () => {
    await expectPgError(
      asUser(db, alice, (tx) => save(tx, legDay(randomUUID(), { targetDistanceM: 5000 }))),
      { code: "23514", constraint: "workout_templates_cardio_targets_only_for_cardio" },
    );
  });

  it("is all-or-nothing: a bad exercise leaves no template behind", async () => {
    const id = randomUUID();
    await expectPgError(
      asUser(db, alice, (tx) => save(tx, legDay(id, { exercises: [{ exerciseId: squat, targetSets: 0 }] }))),
      { code: "23514" },
    );
    expect(await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id))).toHaveLength(0);
  });

  it("needs a signed-in user", async () => {
    await expectPgError(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role authenticated`);
        await save(tx, the5k(randomUUID()));
      }),
      { code: "42501" },
    );
  });

  it("is not callable by anon", async () => {
    await expectPgError(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role anon`);
        await save(tx, the5k(randomUUID()));
      }),
      { code: "42501" },
    );
  });
});

describe("save_template: replace", () => {
  it("replaces exercises and fields in one go", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, legDay(id)));
    await asUser(db, alice, (tx) =>
      save(tx, legDay(id, { name: "Leg Day v2", notes: null, exercises: [{ exerciseId: plank, targetSets: 3, targetDurationSec: 45 }] }), true),
    );
    const [row] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id));
    expect(row).toMatchObject({ name: "Leg Day v2", notes: null });
    expect((await items(id)).map((e) => [e.position, e.exerciseId, e.targetSets, e.targetDurationSec])).toEqual([
      [1, plank, 3, 45],
    ]);
  });

  it("can turn a strength regular into a run", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, legDay(id)));
    await asUser(db, alice, (tx) => save(tx, the5k(id), true));
    const [row] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id));
    expect(row).toMatchObject({ type: "running", targetDistanceM: 5000 });
    expect(await items(id)).toHaveLength(0);
  });

  it("cannot replace someone else's regular (P0002, untouched)", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, the5k(id)));
    await expectPgError(
      asUser(db, bob, (tx) => save(tx, the5k(id, { name: "Hijacked" }), true)),
      { code: "P0002" },
    );
    const [row] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id));
    expect(row!.name).toBe("The 5K");
  });

  it("cannot replace an archived regular (P0002)", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, the5k(id)));
    await db.update(workoutTemplates).set({ archived: true }).where(eq(workoutTemplates.id, id));
    await expectPgError(
      asUser(db, alice, (tx) => save(tx, the5k(id, { name: "Back" }), true)),
      { code: "P0002" },
    );
  });
});

describe("archive and usage", () => {
  it("counts uses and the last-used date from activities, per user", async () => {
    const id = randomUUID();
    await asUser(db, alice, async (tx) => {
      await save(tx, the5k(id));
      for (const date of ["2026-11-20", "2026-11-24", "2026-11-22"]) {
        await saveActivity(tx, { id: randomUUID(), type: "running", date, durationSec: 1800, templateId: id });
      }
    });
    const mine = await asUser(db, alice, (tx) =>
      tx.select().from(workoutTemplateUsage).where(eq(workoutTemplateUsage.templateId, id)),
    );
    expect(mine).toEqual([{ templateId: id, userId: alice, usedCount: 3, lastUsedOn: "2026-11-24" }]);

    // Bob sees nothing of Alice's usage.
    const bobs = await asUser(db, bob, (tx) =>
      tx.select().from(workoutTemplateUsage).where(eq(workoutTemplateUsage.templateId, id)),
    );
    expect(bobs).toEqual([]);
  });

  it("a fresh regular is used 0×", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, legDay(id)));
    const [u] = await asUser(db, alice, (tx) =>
      tx.select().from(workoutTemplateUsage).where(eq(workoutTemplateUsage.templateId, id)),
    );
    expect(u).toMatchObject({ usedCount: 0, lastUsedOn: null });
  });

  it("archiving keeps past activities, their data and their link", async () => {
    const id = randomUUID();
    const activityId = randomUUID();
    await asUser(db, alice, async (tx) => {
      await save(tx, legDay(id));
      await saveActivity(tx, {
        id: activityId,
        type: "strength",
        date: "2026-11-24",
        templateId: id,
        exercises: [{ exerciseId: squat, sets: [{ reps: 10, weightKg: 40 }] }],
      });
    });

    // The API's archive: an RLS-scoped update.
    const archived = await asUser(db, alice, (tx) =>
      tx.update(workoutTemplates).set({ archived: true }).where(eq(workoutTemplates.id, id)).returning({ id: workoutTemplates.id }),
    );
    expect(archived).toHaveLength(1);

    const [a] = await db.select().from(activities).where(eq(activities.id, activityId));
    expect(a).toMatchObject({ templateId: id, type: "strength" });
    expect(await items(id)).toHaveLength(2);
    const [u] = await asUser(db, alice, (tx) =>
      tx.select().from(workoutTemplateUsage).where(eq(workoutTemplateUsage.templateId, id)),
    );
    expect(u!.usedCount).toBe(1);
  });

  it("Bob cannot archive Alice's regular", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, the5k(id)));
    const res = await asUser(db, bob, (tx) =>
      tx.update(workoutTemplates).set({ archived: true }).where(eq(workoutTemplates.id, id)).returning({ id: workoutTemplates.id }),
    );
    expect(res).toHaveLength(0);
    const [row] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id));
    expect(row!.archived).toBe(false);
  });

  it("Bob cannot log an activity against Alice's regular", async () => {
    const id = randomUUID();
    await asUser(db, alice, (tx) => save(tx, the5k(id)));
    await expectPgError(
      asUser(db, bob, (tx) =>
        saveActivity(tx, { id: randomUUID(), type: "running", date: "2026-11-24", durationSec: 1800, templateId: id }),
      ),
      { code: "42501" },
    );
  });
});
