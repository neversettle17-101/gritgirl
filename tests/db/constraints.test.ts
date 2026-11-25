import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
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
  type Activity,
} from "@/lib/db/schema";
import { connect, createUser, deleteUsers, expectPgError } from "./helpers";

// These run as the DB owner: they test constraints and triggers, not RLS.
const { db, close } = connect();
const CHECK = "23514";
const NOT_NULL = "23502";
const UNIQUE = "23505";

let user: string;
let exerciseId: string;
let liftId: string;
let aeId: string;

type NewActivity = Partial<Activity> & Pick<Activity, "type">;
const activity = (v: NewActivity) =>
  db
    .insert(activities)
    .values({ userId: user, date: "2026-11-24", ...v })
    .returning();

beforeAll(async () => {
  user = await createUser(db, "constraints");
  const [ex] = await db
    .insert(exercises)
    .values({ ownerUserId: user, source: "custom", name: "Goblet Squat" })
    .returning();
  exerciseId = ex!.id;
  const [lift] = await activity({ type: "strength" });
  liftId = lift!.id;
  const [ae] = await db
    .insert(activityExercises)
    .values({ activityId: liftId, exerciseId, position: 1 })
    .returning();
  aeId = ae!.id;
});

afterAll(async () => {
  await deleteUsers(db, [user]);
  await close();
});

describe("activities", () => {
  it("stores a run with feel, HR and distance", async () => {
    const [run] = await activity({
      type: "running",
      durationSec: 1860,
      distanceM: 5200,
      avgHeartRate: 154,
      feel: "solid",
    });
    expect(run).toMatchObject({ feel: "solid", avgHeartRate: 154, distanceM: 5200 });
  });

  it("rejects cardio fields on strength rows", async () => {
    await expectPgError(activity({ type: "strength", distanceM: 1000 }), {
      code: CHECK,
      constraint: "activities_cardio_fields_only_for_cardio",
    });
    await expectPgError(activity({ type: "strength", avgHeartRate: 120 }), {
      code: CHECK,
      constraint: "activities_cardio_fields_only_for_cardio",
    });
  });

  it("requires a duration for runs and walks, not for strength", async () => {
    await expectPgError(activity({ type: "walking" }), {
      code: CHECK,
      constraint: "activities_cardio_requires_duration",
    });
    await expect(activity({ type: "strength" })).resolves.toHaveLength(1);
  });

  it.each([
    [{ durationSec: 0 }, "activities_duration_positive"],
    [{ distanceM: -5 }, "activities_distance_positive"],
    [{ avgHeartRate: 29 }, "activities_avg_heart_rate_range"],
    [{ avgHeartRate: 231 }, "activities_avg_heart_rate_range"],
    [{ notes: "x".repeat(2001) }, "activities_notes_length"],
  ] as const)("rejects %o", async (bad, constraint) => {
    await expectPgError(activity({ type: "running", durationSec: 600, ...bad }), {
      code: CHECK,
      constraint,
    });
  });

  it("rejects an unknown feel value", async () => {
    await expectPgError(
      activity({ type: "running", durationSec: 60, feel: "meh" as Activity["feel"] }),
      { code: "22P02" }, // invalid_text_representation for the enum
    );
  });

  it("does not allow exercises on a run, nor changing a strength workout's type", async () => {
    const [run] = await activity({ type: "running", durationSec: 60 });
    await expectPgError(
      db.insert(activityExercises).values({ activityId: run!.id, exerciseId, position: 1 }),
      { code: CHECK, message: /strength activity/ },
    );
    await expectPgError(
      db.update(activities).set({ type: "running", durationSec: 60 }).where(eq(activities.id, liftId)),
      { code: CHECK, message: /cannot change type/ },
    );
  });
});

describe("exercise_sets", () => {
  it("accepts reps-only, time-only and weighted sets", async () => {
    const rows = await db
      .insert(exerciseSets)
      .values([
        { activityExerciseId: aeId, setNumber: 1, reps: 8, weightKg: 42.5 },
        { activityExerciseId: aeId, setNumber: 2, durationSec: 60 },
      ])
      .returning();
    expect(rows.map((r) => r.weightKg)).toEqual([42.5, null]);
  });

  it("rejects a set with neither reps nor time", async () => {
    await expectPgError(
      db.insert(exerciseSets).values({ activityExerciseId: aeId, setNumber: 3, weightKg: 20 }),
      { code: CHECK, constraint: "set_has_reps_or_time" },
    );
  });

  it.each([
    [{ reps: 0 }, "exercise_sets_reps_positive"],
    [{ reps: 5, durationSec: 0 }, "exercise_sets_duration_positive"],
    [{ reps: 5, weightKg: -1 }, "exercise_sets_weight_nonnegative"],
  ] as const)("rejects %o", async (bad, constraint) => {
    await expectPgError(
      db.insert(exerciseSets).values({ activityExerciseId: aeId, setNumber: 9, ...bad }),
      { code: CHECK, constraint },
    );
  });

  it("rejects duplicate set numbers within one exercise", async () => {
    await expectPgError(
      db.insert(exerciseSets).values({ activityExerciseId: aeId, setNumber: 1, reps: 1 }),
      { code: UNIQUE, constraint: "exercise_sets_set_number_unique" },
    );
  });
});

describe("workout_templates (Regulars)", () => {
  it("stores run/walk targets and strength exercises", async () => {
    const [walk] = await db
      .insert(workoutTemplates)
      .values({
        userId: user,
        type: "walking",
        name: "Sunset Stroll",
        targetDistanceM: 3000,
        targetDurationSec: 2100,
      })
      .returning();
    expect(walk).toMatchObject({ targetDistanceM: 3000, targetDurationSec: 2100 });
  });

  it("rejects cardio targets on a strength template", async () => {
    await expectPgError(
      db
        .insert(workoutTemplates)
        .values({ userId: user, type: "strength", name: "Leg Day", targetDistanceM: 100 }),
      { code: CHECK, constraint: "workout_templates_cardio_targets_only_for_cardio" },
    );
  });

  it("only strength templates can have exercises", async () => {
    const [run] = await db
      .insert(workoutTemplates)
      .values({ userId: user, type: "running", name: "The 5K", targetDistanceM: 5000 })
      .returning();
    await expectPgError(
      db.insert(templateExercises).values({ templateId: run!.id, exerciseId, position: 1 }),
      { code: CHECK, message: /strength template/ },
    );
  });

  it("derives usage counts and nulls template_id when a template is deleted", async () => {
    const [t] = await db
      .insert(workoutTemplates)
      .values({ userId: user, type: "running", name: "Tempo", targetDistanceM: 8000 })
      .returning();
    for (const date of ["2026-11-20", "2026-11-22"]) {
      await activity({ type: "running", durationSec: 2400, date, templateId: t!.id });
    }
    const [usage] = await db
      .select()
      .from(workoutTemplateUsage)
      .where(eq(workoutTemplateUsage.templateId, t!.id));
    expect(usage).toMatchObject({ usedCount: 2, lastUsedOn: "2026-11-22" });

    await db.delete(workoutTemplates).where(eq(workoutTemplates.id, t!.id));
    const orphaned = await db.select().from(activities).where(and(eq(activities.userId, user), eq(activities.date, "2026-11-22")));
    expect(orphaned.length).toBeGreaterThan(0);
    expect(orphaned.every((a) => a.templateId === null)).toBe(true);
  });
});

describe("exercises", () => {
  it("custom exercises need an owner and no source id; library rows the reverse", async () => {
    await expectPgError(db.insert(exercises).values({ source: "custom", name: "Orphan" }), {
      code: CHECK,
      constraint: "exercises_library_or_custom",
    });
    await expectPgError(
      db
        .insert(exercises)
        .values({ ownerUserId: user, source: "free-exercise-db", sourceId: "x", name: "Owned lib" }),
      { code: CHECK, constraint: "exercises_library_or_custom" },
    );
    await expectPgError(
      db.insert(exercises).values({ ownerUserId: user, source: "wger" as "custom", name: "Unknown source" }),
      { code: CHECK, constraint: "exercises_source_known" },
    );
  });
});

describe("settings, cycle and account lifecycle", () => {
  it("creates a default settings row for every new user", async () => {
    const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, user));
    expect(s).toMatchObject({
      weightUnit: "kg",
      distanceUnit: "km",
      weekStartsOn: 1,
      defaultCycleLen: 28,
      defaultPeriodLen: 5,
      cyclePredictionsOn: true,
    });
  });

  it("validates settings values", async () => {
    const update = (v: Partial<typeof userSettings.$inferInsert>) =>
      db.update(userSettings).set(v).where(eq(userSettings.userId, user));
    await expectPgError(update({ weightUnit: "st" as "kg" }), { code: CHECK });
    await expectPgError(update({ weekStartsOn: 7 }), { code: CHECK });
    await expectPgError(update({ defaultCycleLen: 10 }), { code: CHECK });
  });

  it("allows one period entry per user per day", async () => {
    await db.insert(periodDays).values({ userId: user, date: "2026-11-01", flow: "light" });
    await expectPgError(db.insert(periodDays).values({ userId: user, date: "2026-11-01" }), {
      code: UNIQUE,
    });
    await expectPgError(
      db.insert(periodDays).values({ userId: user, date: null as unknown as string }),
      { code: NOT_NULL },
    );
  });

  it("deleting an account removes all of its data", async () => {
    const u = await createUser(db, "leaver");
    const [ex] = await db
      .insert(exercises)
      .values({ ownerUserId: u, source: "custom", name: "Mine" })
      .returning();
    const [a] = await db
      .insert(activities)
      .values({ id: randomUUID(), userId: u, type: "strength", date: "2026-11-24" })
      .returning();
    const [ae] = await db
      .insert(activityExercises)
      .values({ activityId: a!.id, exerciseId: ex!.id, position: 1 })
      .returning();
    await db.insert(exerciseSets).values({ activityExerciseId: ae!.id, setNumber: 1, reps: 5 });
    await db.insert(periodDays).values({ userId: u, date: "2026-11-02" });

    await deleteUsers(db, [u]);

    expect(await db.select().from(activities).where(eq(activities.userId, u))).toEqual([]);
    expect(await db.select().from(exercises).where(eq(exercises.ownerUserId, u))).toEqual([]);
    expect(
      await db.select().from(exerciseSets).where(eq(exerciseSets.activityExerciseId, ae!.id)),
    ).toEqual([]);
    expect(await db.select().from(periodDays).where(eq(periodDays.userId, u))).toEqual([]);
    expect(await db.select().from(userSettings).where(eq(userSettings.userId, u))).toEqual([]);
  });
});
