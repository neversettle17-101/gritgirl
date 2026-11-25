import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bodyWeightEntries, userSettings } from "@/lib/db/schema";
import { asUser, connect, createUser, deleteUsers, expectPgError, RLS_VIOLATION } from "./helpers";

// Profile: user_settings about-you columns and body_weight_entries —
// owner-only RLS, range checks, one weigh-in per day, account deletion.

const CHECK = "23514";
const UNIQUE = "23505";

const { db, close } = connect();
let alice: string;
let bob: string;
const aliceEntry = randomUUID();

beforeAll(async () => {
  alice = await createUser(db, "alice-profile");
  bob = await createUser(db, "bob-profile");
  await asUser(db, alice, (tx) =>
    tx.insert(bodyWeightEntries).values({ id: aliceEntry, userId: alice, measuredOn: "2026-11-20", weightKg: 62.4 }),
  );
});

afterAll(async () => {
  await deleteUsers(db, [alice, bob]);
  await close();
});

describe("user_settings profile columns", () => {
  it("are optional and empty for a new user", async () => {
    const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, bob));
    expect(s).toMatchObject({ displayName: null, heightCm: null, dateOfBirth: null });
  });

  it("the owner can set them through RLS", async () => {
    const [s] = await asUser(db, alice, (tx) =>
      tx
        .update(userSettings)
        .set({ displayName: "Alice", heightCm: 165.1, dateOfBirth: "1995-06-01", weightUnit: "lb", distanceUnit: "mi" })
        .where(eq(userSettings.userId, alice))
        .returning(),
    );
    expect(s).toMatchObject({ displayName: "Alice", heightCm: 165.1, dateOfBirth: "1995-06-01", weightUnit: "lb" });
  });

  it("another user cannot change them", async () => {
    const rows = await asUser(db, bob, (tx) =>
      tx.update(userSettings).set({ displayName: "Hacked" }).where(eq(userSettings.userId, alice)).returning(),
    );
    expect(rows).toEqual([]);
    const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, alice));
    expect(s!.displayName).toBe("Alice");
  });

  it("checks the ranges", async () => {
    const update = (v: Partial<typeof userSettings.$inferInsert>) =>
      db.update(userSettings).set(v).where(eq(userSettings.userId, bob));
    await expectPgError(update({ heightCm: 49.9 }), { code: CHECK, constraint: "user_settings_height_cm" });
    await expectPgError(update({ heightCm: 272.1 }), { code: CHECK, constraint: "user_settings_height_cm" });
    await expectPgError(update({ dateOfBirth: "1899-12-31" }), { code: CHECK, constraint: "user_settings_date_of_birth" });
    await expectPgError(update({ displayName: "   " }), { code: CHECK, constraint: "user_settings_display_name_length" });
    await expectPgError(update({ displayName: "x".repeat(61) }), { code: CHECK, constraint: "user_settings_display_name_length" });
    await update({ heightCm: 50, displayName: "x".repeat(60), dateOfBirth: "1900-01-01" });
    await update({ heightCm: null, displayName: null, dateOfBirth: null });
  });
});

describe("body_weight_entries", () => {
  it("the owner reads, upserts and deletes her own weigh-ins", async () => {
    await asUser(db, alice, async (tx) => {
      expect(await tx.select().from(bodyWeightEntries)).toHaveLength(1);

      // Same day again replaces the weigh-in (what the API does).
      await tx
        .insert(bodyWeightEntries)
        .values({ userId: alice, measuredOn: "2026-11-20", weightKg: 62.1 })
        .onConflictDoUpdate({
          target: [bodyWeightEntries.userId, bodyWeightEntries.measuredOn],
          set: { weightKg: 62.1 },
        });
      const rows = await tx.select().from(bodyWeightEntries);
      expect(rows.map((r) => [r.id, r.weightKg])).toEqual([[aliceEntry, 62.1]]);

      const extra = randomUUID();
      await tx.insert(bodyWeightEntries).values({ id: extra, userId: alice, measuredOn: "2026-11-21", weightKg: 62 });
      expect(await tx.delete(bodyWeightEntries).where(eq(bodyWeightEntries.id, extra)).returning()).toHaveLength(1);
    });
  });

  it("another user can't see, change or delete them", async () => {
    await asUser(db, bob, async (tx) => {
      expect(await tx.select().from(bodyWeightEntries)).toEqual([]);
      expect(
        await tx.update(bodyWeightEntries).set({ weightKg: 99 }).where(eq(bodyWeightEntries.id, aliceEntry)).returning(),
      ).toEqual([]);
      expect(await tx.delete(bodyWeightEntries).where(eq(bodyWeightEntries.id, aliceEntry)).returning()).toEqual([]);
    });
    const [e] = await db.select().from(bodyWeightEntries).where(eq(bodyWeightEntries.id, aliceEntry));
    expect(e!.weightKg).toBe(62.1);
  });

  it("another user can't write one for her", async () => {
    await expectPgError(
      asUser(db, bob, (tx) => tx.insert(bodyWeightEntries).values({ userId: alice, measuredOn: "2026-11-22", weightKg: 60 })),
      { code: RLS_VIOLATION },
    );
    await expectPgError(
      asUser(db, alice, (tx) =>
        tx.update(bodyWeightEntries).set({ userId: bob }).where(eq(bodyWeightEntries.id, aliceEntry)),
      ),
      { code: RLS_VIOLATION },
    );
  });

  it("anonymous requests can't read them", async () => {
    await expectPgError(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role anon`);
        await tx.select().from(bodyWeightEntries);
      }),
      { code: "42501" },
    );
  });

  it("checks weight range and one entry per day", async () => {
    const add = (weightKg: number, measuredOn = "2026-10-01") =>
      db.insert(bodyWeightEntries).values({ userId: bob, measuredOn, weightKg });
    await expectPgError(add(19.99), { code: CHECK, constraint: "body_weight_entries_weight_kg" });
    await expectPgError(add(400.01), { code: CHECK, constraint: "body_weight_entries_weight_kg" });
    await expectPgError(add(60, "1899-12-31"), { code: CHECK, constraint: "body_weight_entries_measured_on" });
    await add(20);
    await expectPgError(add(60), { code: UNIQUE, constraint: "body_weight_entries_one_per_day" });
  });

  it("are deleted with the account", async () => {
    const u = await createUser(db, "leaver-profile");
    await db.insert(bodyWeightEntries).values({ userId: u, measuredOn: "2026-11-01", weightKg: 70 });
    await deleteUsers(db, [u]);
    expect(await db.select().from(bodyWeightEntries).where(eq(bodyWeightEntries.userId, u))).toEqual([]);
  });
});
