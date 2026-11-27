import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exercises } from "@/lib/db/schema";
import { asUser, connect, createUser, deleteUsers, expectPgError } from "./helpers";

// exercise_progress (db/migrations/20261127000001_exercise_progress.sql),
// called as the API calls it: as the signed-in user, through RLS.

const { db, close } = connect();

let alice: string;
let bob: string;
const squat = randomUUID();
const plank = randomUUID();

type Tx = Parameters<Parameters<typeof asUser>[2]>[0];

type Row = {
  exercise_id: string;
  name: string;
  tracking: string;
  sessions: { activityId: string; date: string; sets: { reps: number | null; durationSec: number | null; weightKg: number | null }[] }[];
};

function save(tx: Tx, doc: Record<string, unknown>) {
  return tx.execute(sql`select public.save_activity(${JSON.stringify(doc)}::jsonb, false)`);
}

function progress(tx: Tx, exerciseId: string | null = null) {
  return tx.execute<Row>(sql`select * from public.exercise_progress(${exerciseId}::uuid)`);
}

const workout = (date: string, squatKg: number) => ({
  id: randomUUID(),
  type: "strength",
  date,
  exercises: [
    { exerciseId: squat, sets: [{ reps: 8, weightKg: squatKg }, { reps: 6, weightKg: squatKg }] },
    { exerciseId: plank, sets: [{ durationSec: 60 }] },
  ],
});

beforeAll(async () => {
  alice = await createUser(db, "alice-progress");
  bob = await createUser(db, "bob-progress");
  await db.insert(exercises).values([
    { id: squat, source: "free-exercise-db", sourceId: `progress-test-${squat}`, name: "Zz Progress Test Squat" },
    { id: plank, source: "free-exercise-db", sourceId: `progress-test-${plank}`, name: "Zz Progress Test Plank", tracking: "time" },
  ]);
  await asUser(db, alice, async (tx) => {
    // Saved out of order on purpose: sessions come back oldest first.
    await save(tx, workout("2026-11-24", 42.5));
    await save(tx, workout("2026-11-17", 40));
    // A run is not strength history.
    await save(tx, { id: randomUUID(), type: "running", date: "2026-11-18", durationSec: 1800, distanceM: 5000 });
  });
});

afterAll(async () => {
  await deleteUsers(db, [alice, bob]);
  await db.delete(exercises).where(inArray(exercises.id, [squat, plank]));
  await close();
});

describe("exercise_progress", () => {
  it("returns my history per exercise, sessions oldest first, sets in order", async () => {
    const rows = await asUser(db, alice, (tx) => progress(tx));
    expect(rows.map((r) => r.name).sort()).toEqual(["Zz Progress Test Plank", "Zz Progress Test Squat"]);
    const sq = rows.find((r) => r.exercise_id === squat)!;
    expect(sq.tracking).toBe("reps");
    expect(sq.sessions.map((s) => s.date)).toEqual(["2026-11-17", "2026-11-24"]);
    expect(sq.sessions[1]!.sets).toEqual([
      { reps: 8, durationSec: null, weightKg: 42.5 },
      { reps: 6, durationSec: null, weightKg: 42.5 },
    ]);
    const pl = rows.find((r) => r.exercise_id === plank)!;
    expect(pl.sessions[0]!.sets).toEqual([{ reps: null, durationSec: 60, weightKg: null }]);
  });

  it("filters to one exercise", async () => {
    const rows = await asUser(db, alice, (tx) => progress(tx, squat));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.exercise_id).toBe(squat);
  });

  it("users can't see another user's progress (RLS), even asking by exercise id", async () => {
    expect(await asUser(db, bob, (tx) => progress(tx))).toHaveLength(0);
    expect(await asUser(db, bob, (tx) => progress(tx, squat))).toHaveLength(0);
  });

  it("only counts the caller's own sessions", async () => {
    await asUser(db, bob, (tx) => save(tx, workout("2026-11-25", 100)));
    const mine = await asUser(db, alice, (tx) => progress(tx, squat));
    expect(mine[0]!.sessions.map((s) => s.date)).toEqual(["2026-11-17", "2026-11-24"]);
    const bobs = await asUser(db, bob, (tx) => progress(tx, squat));
    expect(bobs[0]!.sessions.map((s) => s.date)).toEqual(["2026-11-25"]);
  });

  it("returns nothing without a signed-in user", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`);
      return progress(tx);
    });
    expect(rows).toHaveLength(0);
  });

  it("is not callable by anon", async () => {
    await expectPgError(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role anon`);
        await progress(tx);
      }),
      { code: "42501" },
    );
  });

  it("runs as the caller (security invoker)", async () => {
    const [fn] = await db.execute<{ prosecdef: boolean }>(
      sql`select prosecdef from pg_proc where oid = 'public.exercise_progress(uuid)'::regprocedure`,
    );
    expect(fn!.prosecdef).toBe(false);
  });
});
