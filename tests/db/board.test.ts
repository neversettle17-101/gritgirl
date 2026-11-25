import { and, eq, gte, lte } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activities, userSettings } from "@/lib/db/schema";
import type { ActivityDetail } from "@/lib/domain/activity-types";
import { buildBoard, normalizeWeekStart, resolveRange, streakWindow } from "@/lib/domain/board";
import { asUser, connect, createUser, deleteUsers } from "./helpers";

/**
 * The Board's data access under RLS (§8.1, §11): the same two activity
 * queries and the settings read /api/board makes, run as each user. Another
 * user's board for the same dates is empty, and nobody can read or change
 * someone else's week start.
 */

const { db, close } = connect();
let alice: string;
let bob: string;
const TODAY = "2026-11-25";

type Tx = Parameters<Parameters<typeof asUser>[2]>[0];

async function boardFor(tx: Tx, view: "day" | "week" | "month", date: string) {
  const [settings] = await tx.select({ weekStartsOn: userSettings.weekStartsOn }).from(userSettings);
  const range = resolveRange(view, date, normalizeWeekStart(settings?.weekStartsOn));
  const inRange = (from: string, to: string) => and(gte(activities.date, from), lte(activities.date, to));
  const rows = await tx.select().from(activities).where(inRange(range.from, range.to));
  const window = streakWindow(range, TODAY);
  const dates = await tx.select({ date: activities.date }).from(activities).where(inRange(window.from, window.to));
  const acts: ActivityDetail[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    date: r.date,
    startTime: r.startTime ? r.startTime.slice(0, 5) : null,
    durationSec: r.durationSec,
    notes: r.notes,
    feel: r.feel,
    distanceM: r.distanceM,
    avgHeartRate: r.avgHeartRate,
    templateId: r.templateId,
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
    exercises: [],
  }));
  return buildBoard({ range, today: TODAY, activities: acts, streakDates: dates.map((d) => d.date) });
}

beforeAll(async () => {
  alice = await createUser(db, "board-alice");
  bob = await createUser(db, "board-bob");
  await asUser(db, alice, async (tx) => {
    await tx.update(userSettings).set({ weekStartsOn: 0 }).where(eq(userSettings.userId, alice));
    await tx.insert(activities).values([
      { userId: alice, type: "running", date: "2026-11-23", durationSec: 1860, distanceM: 5200 },
      { userId: alice, type: "strength", date: "2026-11-24", durationSec: 2580 },
      { userId: alice, type: "walking", date: "2026-11-25", durationSec: 600, distanceM: 1000 },
    ]);
  });
});

afterAll(async () => {
  await deleteUsers(db, [alice, bob]);
  await close();
});

describe("board under RLS", () => {
  it("Alice's week uses her week start and her activities", async () => {
    const board = await asUser(db, alice, (tx) => boardFor(tx, "week", TODAY));
    expect(board.range).toMatchObject({ start: "2026-11-22", end: "2026-11-28" });
    expect(board.totals).toMatchObject({ workouts: 3, runs: 1, walks: 1, strength: 1, minutes: 84, activeDays: 3 });
    expect(board.streaks).toEqual({ current: 3, longest: 3 });
  });

  it("Bob's board for the same dates is empty (and Monday-based)", async () => {
    for (const view of ["day", "week", "month"] as const) {
      const board = await asUser(db, bob, (tx) => boardFor(tx, view, TODAY));
      expect(board.totals.workouts, view).toBe(0);
      expect(board.days.every((d) => d.activities.length === 0), view).toBe(true);
      expect(board.streaks, view).toEqual({ current: 0, longest: 0 });
    }
    const week = await asUser(db, bob, (tx) => boardFor(tx, "week", TODAY));
    expect(week.range.start).toBe("2026-11-23");
  });

  it("Bob cannot read or change Alice's week start", async () => {
    const seen = await asUser(db, bob, (tx) =>
      tx.select().from(userSettings).where(eq(userSettings.userId, alice)),
    );
    expect(seen).toEqual([]);
    const changed = await asUser(db, bob, (tx) =>
      tx.update(userSettings).set({ weekStartsOn: 3 }).where(eq(userSettings.userId, alice)).returning(),
    );
    expect(changed).toEqual([]);
    const [mine] = await asUser(db, alice, (tx) => tx.select().from(userSettings));
    expect(mine?.weekStartsOn).toBe(0);
  });
});
