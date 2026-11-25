import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activities,
  activityExercises,
  exercises,
  exerciseSets,
  periodDays,
  templateExercises,
  userSettings,
  workoutTemplates,
  workoutTemplateUsage,
} from "@/lib/db/schema";
import { asUser, connect, createUser, deleteUsers, expectPgError, RLS_VIOLATION } from "./helpers";

const { db, close } = connect();

let alice: string;
let bob: string;

// Alice's rows, created through RLS as Alice.
const ids = {
  libraryExercise: randomUUID(),
  aliceCustomExercise: randomUUID(),
  aliceStrengthTemplate: randomUUID(),
  aliceRunTemplate: randomUUID(),
  aliceTemplateExercise: randomUUID(),
  aliceRun: randomUUID(),
  aliceLift: randomUUID(),
  aliceActivityExercise: randomUUID(),
  aliceSet: randomUUID(),
};

beforeAll(async () => {
  alice = await createUser(db, "alice");
  bob = await createUser(db, "bob");

  // A library exercise (no owner) — only the DB owner / seed can write these.
  await db.insert(exercises).values({
    id: ids.libraryExercise,
    source: "free-exercise-db",
    sourceId: `rls-test-${ids.libraryExercise}`,
    name: "RLS Test Squat",
  });

  await asUser(db, alice, async (tx) => {
    await tx.insert(exercises).values({
      id: ids.aliceCustomExercise,
      ownerUserId: alice,
      source: "custom",
      name: "Alice's Secret Lift",
    });
    await tx.insert(workoutTemplates).values([
      { id: ids.aliceStrengthTemplate, userId: alice, type: "strength", name: "Lower Body A" },
      {
        id: ids.aliceRunTemplate,
        userId: alice,
        type: "running",
        name: "The 5K",
        targetDistanceM: 5000,
        targetDurationSec: 1800,
      },
    ]);
    await tx.insert(templateExercises).values({
      id: ids.aliceTemplateExercise,
      templateId: ids.aliceStrengthTemplate,
      exerciseId: ids.aliceCustomExercise,
      position: 1,
    });
    await tx.insert(activities).values([
      {
        id: ids.aliceRun,
        userId: alice,
        type: "running",
        date: "2026-11-24",
        durationSec: 1920,
        distanceM: 5200,
        avgHeartRate: 152,
        feel: "spicy",
        templateId: ids.aliceRunTemplate,
      },
      { id: ids.aliceLift, userId: alice, type: "strength", date: "2026-11-24", durationSec: 3120 },
    ]);
    await tx.insert(activityExercises).values({
      id: ids.aliceActivityExercise,
      activityId: ids.aliceLift,
      exerciseId: ids.libraryExercise,
      position: 1,
    });
    await tx.insert(exerciseSets).values({
      id: ids.aliceSet,
      activityExerciseId: ids.aliceActivityExercise,
      setNumber: 1,
      reps: 8,
      weightKg: 40,
    });
    await tx.insert(periodDays).values({ userId: alice, date: "2026-11-20", flow: "medium" });
  });
});

afterAll(async () => {
  await deleteUsers(db, [alice, bob]);
  await db.delete(exercises).where(eq(exercises.id, ids.libraryExercise));
  await close();
});

describe("owner can use their own rows", () => {
  it("Alice reads everything she wrote", async () => {
    await asUser(db, alice, async (tx) => {
      expect(await tx.select().from(activities)).toHaveLength(2);
      expect(await tx.select().from(activityExercises)).toHaveLength(1);
      expect(await tx.select().from(exerciseSets)).toHaveLength(1);
      expect(await tx.select().from(workoutTemplates)).toHaveLength(2);
      expect(await tx.select().from(templateExercises)).toHaveLength(1);
      expect(await tx.select().from(periodDays)).toHaveLength(1);
      expect(await tx.select().from(userSettings)).toHaveLength(1);
      const usage = await tx.select().from(workoutTemplateUsage);
      expect(usage.find((u) => u.templateId === ids.aliceRunTemplate)?.usedCount).toBe(1);
    });
  });
});

describe("user B cannot read user A's rows", () => {
  it.each([
    ["activities", activities],
    ["activity_exercises", activityExercises],
    ["exercise_sets", exerciseSets],
    ["workout_templates", workoutTemplates],
    ["template_exercises", templateExercises],
    ["period_days", periodDays],
  ] as const)("%s is empty for Bob", async (_name, table) => {
    const rows = await asUser(db, bob, (tx) => tx.select().from(table));
    expect(rows).toEqual([]);
  });

  it("Bob only sees his own settings row", async () => {
    const rows = await asUser(db, bob, (tx) => tx.select().from(userSettings));
    expect(rows.map((r) => r.userId)).toEqual([bob]);
  });

  it("Bob sees no template usage for Alice's templates", async () => {
    const rows = await asUser(db, bob, (tx) => tx.select().from(workoutTemplateUsage));
    expect(rows).toEqual([]);
  });
});

describe("exercise library visibility", () => {
  it("library exercises are readable by every signed-in user", async () => {
    for (const user of [alice, bob]) {
      const rows = await asUser(db, user, (tx) =>
        tx.select().from(exercises).where(eq(exercises.id, ids.libraryExercise)),
      );
      expect(rows).toHaveLength(1);
    }
  });

  it("custom exercises are visible only to their owner", async () => {
    const q = (user: string) =>
      asUser(db, user, (tx) =>
        tx.select().from(exercises).where(eq(exercises.id, ids.aliceCustomExercise)),
      );
    expect(await q(alice)).toHaveLength(1);
    expect(await q(bob)).toHaveLength(0);
  });

  it("users cannot create or edit library exercises", async () => {
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.insert(exercises).values({ source: "free-exercise-db", sourceId: "x", name: "Fake" }),
      ),
      { code: RLS_VIOLATION },
    );
    const updated = await asUser(db, bob, (tx) =>
      tx
        .update(exercises)
        .set({ name: "Hacked" })
        .where(eq(exercises.id, ids.libraryExercise))
        .returning(),
    );
    expect(updated).toEqual([]);
  });

  it("users cannot create a custom exercise owned by someone else", async () => {
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.insert(exercises).values({ ownerUserId: alice, source: "custom", name: "Planted" }),
      ),
      { code: RLS_VIOLATION },
    );
  });

  it("anonymous requests cannot read anything", async () => {
    await expectPgError(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role anon`);
        await tx.select().from(exercises);
      }),
      { code: "42501" },
    );
  });
});

describe("user B cannot write user A's rows", () => {
  it("cannot insert rows owned by Alice", async () => {
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.insert(activities).values({
          userId: alice,
          type: "walking",
          date: "2026-11-24",
          durationSec: 600,
        }),
      ),
      { code: RLS_VIOLATION },
    );
    await expectPgError(
      asUser(db, bob, (tx) => tx.insert(periodDays).values({ userId: alice, date: "2026-11-21" })),
      { code: RLS_VIOLATION },
    );
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.insert(workoutTemplates).values({ userId: alice, type: "strength", name: "x" }),
      ),
      { code: RLS_VIOLATION },
    );
  });

  it("cannot add exercises or sets under Alice's workout", async () => {
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.insert(activityExercises).values({
          activityId: ids.aliceLift,
          exerciseId: ids.libraryExercise,
          position: 2,
        }),
      ),
      { code: RLS_VIOLATION },
    );
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.insert(exerciseSets).values({
          activityExerciseId: ids.aliceActivityExercise,
          setNumber: 2,
          reps: 5,
        }),
      ),
      { code: RLS_VIOLATION },
    );
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.insert(templateExercises).values({
          templateId: ids.aliceStrengthTemplate,
          exerciseId: ids.libraryExercise,
          position: 2,
        }),
      ),
      { code: RLS_VIOLATION },
    );
  });

  it("updates and deletes of Alice's rows affect nothing", async () => {
    await asUser(db, bob, async (tx) => {
      expect(
        await tx
          .update(activities)
          .set({ notes: "hacked" })
          .where(eq(activities.id, ids.aliceRun))
          .returning(),
      ).toEqual([]);
      expect(
        await tx
          .update(exerciseSets)
          .set({ reps: 99 })
          .where(eq(exerciseSets.id, ids.aliceSet))
          .returning(),
      ).toEqual([]);
      expect(await tx.delete(activities).where(eq(activities.id, ids.aliceLift)).returning()).toEqual(
        [],
      );
      expect(
        await tx.delete(periodDays).where(eq(periodDays.userId, alice)).returning(),
      ).toEqual([]);
      expect(
        await tx
          .update(userSettings)
          .set({ weightUnit: "lb" })
          .where(eq(userSettings.userId, alice))
          .returning(),
      ).toEqual([]);
      expect(
        await tx
          .delete(templateExercises)
          .where(eq(templateExercises.id, ids.aliceTemplateExercise))
          .returning(),
      ).toEqual([]);
    });
    // And Alice's data is intact.
    const run = await db.select().from(activities).where(eq(activities.id, ids.aliceRun));
    expect(run[0]?.notes).toBeNull();
    const lift = await db.select().from(activities).where(eq(activities.id, ids.aliceLift));
    expect(lift).toHaveLength(1);
  });

  it("cannot move own rows onto Alice (re-parenting)", async () => {
    const bobRun = randomUUID();
    await asUser(db, bob, (tx) =>
      tx
        .insert(activities)
        .values({ id: bobRun, userId: bob, type: "running", date: "2026-11-24", durationSec: 60 }),
    );
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.update(activities).set({ userId: alice }).where(eq(activities.id, bobRun)),
      ),
      { code: RLS_VIOLATION },
    );
  });

  it("cannot reference Alice's custom exercise or template from own rows", async () => {
    const bobLift = randomUUID();
    const bobTemplate = randomUUID();
    await asUser(db, bob, async (tx) => {
      await tx
        .insert(activities)
        .values({ id: bobLift, userId: bob, type: "strength", date: "2026-11-24" });
      await tx
        .insert(workoutTemplates)
        .values({ id: bobTemplate, userId: bob, type: "strength", name: "Mine" });
    });
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.insert(activityExercises).values({
          activityId: bobLift,
          exerciseId: ids.aliceCustomExercise,
          position: 1,
        }),
      ),
      { code: RLS_VIOLATION },
    );
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.insert(templateExercises).values({
          templateId: bobTemplate,
          exerciseId: ids.aliceCustomExercise,
          position: 1,
        }),
      ),
      { code: RLS_VIOLATION },
    );
    await expectPgError(
      asUser(db, bob, (tx) =>
        tx.insert(activities).values({
          userId: bob,
          type: "running",
          date: "2026-11-24",
          durationSec: 60,
          templateId: ids.aliceRunTemplate,
        }),
      ),
      { code: RLS_VIOLATION },
    );
  });
});
