import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { periodDays, userSettings } from "@/lib/db/schema";
import { asUser, connect, createUser, deleteUsers, expectPgError, RLS_VIOLATION } from "./helpers";

// M5: user_settings onboarding columns and public.replace_period_days().
const { db, close } = connect();

let alice: string;
let bob: string;

const INVALID = "22023"; // invalid_parameter_value
const CHECK = "23514";

type Day = { date: string; flow?: string | null };

function replace(userId: string, from: string, to: string, days: Day[]) {
  return asUser(db, userId, (tx) =>
    tx.execute(
      sql`select public.replace_period_days(${from}::date, ${to}::date, ${JSON.stringify(days)}::jsonb)`,
    ),
  );
}

async function logged(userId: string) {
  const rows = await db
    .select({ date: periodDays.date, flow: periodDays.flow })
    .from(periodDays)
    .where(eq(periodDays.userId, userId))
    .orderBy(asc(periodDays.date));
  return rows;
}

beforeAll(async () => {
  alice = await createUser(db, "alice-cycle");
  bob = await createUser(db, "bob-cycle");
});

afterAll(async () => {
  await deleteUsers(db, [alice, bob]);
  await close();
});

describe("replace_period_days()", () => {
  it("sets a range with per-day flow", async () => {
    await replace(alice, "2026-11-01", "2026-11-03", [
      { date: "2026-11-01", flow: "heavy" },
      { date: "2026-11-02", flow: "medium" },
      { date: "2026-11-03" },
    ]);
    expect(await logged(alice)).toEqual([
      { date: "2026-11-01", flow: "heavy" },
      { date: "2026-11-02", flow: "medium" },
      { date: "2026-11-03", flow: null },
    ]);
  });

  it("edits a period atomically: moves the end, changes flow, keeps days outside the range", async () => {
    await replace(alice, "2026-10-04", "2026-10-04", [{ date: "2026-10-04", flow: "light" }]);
    await replace(alice, "2026-11-01", "2026-11-05", [
      { date: "2026-11-01", flow: "light" },
      { date: "2026-11-02", flow: "medium" },
    ]);
    expect(await logged(alice)).toEqual([
      { date: "2026-10-04", flow: "light" },
      { date: "2026-11-01", flow: "light" },
      { date: "2026-11-02", flow: "medium" },
    ]);
  });

  it("an empty list clears the range", async () => {
    await replace(alice, "2026-11-01", "2026-11-30", []);
    expect(await logged(alice)).toEqual([{ date: "2026-10-04", flow: "light" }]);
  });

  it("rejects bad input and leaves data untouched", async () => {
    const before = await logged(alice);
    await expectPgError(replace(alice, "2026-11-05", "2026-11-01", []), { code: INVALID });
    await expectPgError(replace(alice, "2025-01-01", "2026-11-01", []), { code: INVALID });
    await expectPgError(
      replace(alice, "2026-11-01", "2026-11-02", [{ date: "2026-11-09" }]),
      { code: INVALID },
    );
    await expectPgError(
      replace(alice, "2026-11-01", "2026-11-02", [{ date: "2026-11-01" }, { date: "2026-11-01" }]),
      { code: INVALID },
    );
    await expectPgError(
      replace(alice, "2026-11-01", "2026-11-02", [{ date: "2026-11-01", flow: "torrential" }]),
      { code: "22P02" },
    );
    expect(await logged(alice)).toEqual(before);
  });

  it("only ever touches the caller's own rows (RLS)", async () => {
    await replace(bob, "2026-10-04", "2026-10-06", [{ date: "2026-10-05", flow: "heavy" }]);
    // Bob's clear of the same dates did not remove Alice's 2026-10-04.
    expect(await logged(alice)).toEqual([{ date: "2026-10-04", flow: "light" }]);
    expect(await logged(bob)).toEqual([{ date: "2026-10-05", flow: "heavy" }]);

    // Alice clearing a range does not remove Bob's day.
    await replace(alice, "2026-10-01", "2026-10-31", []);
    expect(await logged(alice)).toEqual([]);
    expect(await logged(bob)).toEqual([{ date: "2026-10-05", flow: "heavy" }]);

    // And Alice cannot see Bob's days through RLS.
    const seen = await asUser(db, alice, (tx) => tx.select().from(periodDays));
    expect(seen).toEqual([]);
  });

  it("cannot be called without a user, and anon cannot execute it", async () => {
    await expectPgError(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role authenticated`);
        await tx.execute(sql`select public.replace_period_days('2026-11-01', '2026-11-01', '[]')`);
      }),
      { code: RLS_VIOLATION },
    );
    await expectPgError(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role anon`);
        await tx.execute(sql`select public.replace_period_days('2026-11-01', '2026-11-01', '[]')`);
      }),
      { code: RLS_VIOLATION },
    );
  });
});

describe("user_settings onboarding columns", () => {
  it("start empty for a new user (not onboarded)", async () => {
    const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, alice));
    expect(s).toMatchObject({ displayName: null, lastPeriodStart: null, onboardedAt: null });
  });

  it("can be written by the owner only", async () => {
    await asUser(db, alice, (tx) =>
      tx
        .update(userSettings)
        .set({ displayName: "Alice", lastPeriodStart: "2026-11-01", onboardedAt: new Date() })
        .where(eq(userSettings.userId, alice)),
    );
    // Bob's update of Alice's row matches nothing under RLS.
    const touched = await asUser(db, bob, (tx) =>
      tx
        .update(userSettings)
        .set({ displayName: "Mallory" })
        .where(eq(userSettings.userId, alice))
        .returning(),
    );
    expect(touched).toEqual([]);
    const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, alice));
    expect(s).toMatchObject({ displayName: "Alice", lastPeriodStart: "2026-11-01" });
    expect(s!.onboardedAt).not.toBeNull();
  });

  it("validates name length and the engine's period length range", async () => {
    const update = (v: Partial<typeof userSettings.$inferInsert>) =>
      db.update(userSettings).set(v).where(eq(userSettings.userId, alice));
    await expectPgError(update({ displayName: "   " }), { code: CHECK });
    await expectPgError(update({ displayName: "x".repeat(61) }), { code: CHECK });
    await expectPgError(update({ defaultPeriodLen: 15 }), { code: CHECK });
    await update({ defaultPeriodLen: 14 });
  });
});
