/**
 * Drizzle schema — a typed mirror of db/migrations/*.sql.
 *
 * The SQL migrations are the source of truth (they also hold RLS policies,
 * check constraints and triggers). This file exists for typed queries and
 * is kept in sync by tests/db/schema-drift.test.ts, which compares every
 * table/column here with the live database.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

// ───────── enums ─────────

export const activityType = pgEnum("activity_type", ["running", "walking", "strength"]);
export const exerciseTrack = pgEnum("exercise_track", ["reps", "time"]);
export const flowLevel = pgEnum("flow_level", ["spotting", "light", "medium", "heavy"]);
export const feelLevel = pgEnum("feel_level", ["breezy", "easy", "solid", "spicy", "wrecked"]);

export type ActivityType = (typeof activityType.enumValues)[number];
export type ExerciseTrack = (typeof exerciseTrack.enumValues)[number];
export type FlowLevel = (typeof flowLevel.enumValues)[number];
export type FeelLevel = (typeof feelLevel.enumValues)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const id = () => uuid("id").primaryKey().defaultRandom();

// ───────── reference / library ─────────

export const EXERCISE_SOURCES = ["free-exercise-db", "custom"] as const;
export type ExerciseSource = (typeof EXERCISE_SOURCES)[number];

export const exercises = pgTable(
  "exercises",
  {
    id: id(),
    ownerUserId: uuid("owner_user_id").references(() => authUsers.id, { onDelete: "cascade" }),
    source: text("source").$type<ExerciseSource>().notNull(),
    sourceId: text("source_id"),
    name: text("name").notNull(),
    category: text("category"),
    equipment: text("equipment"),
    primaryMuscles: text("primary_muscles").array().notNull().default(sql`'{}'`),
    secondaryMuscles: text("secondary_muscles").array().notNull().default(sql`'{}'`),
    instructions: text("instructions").array().notNull().default(sql`'{}'`),
    imagePaths: text("image_paths").array().notNull().default(sql`'{}'`),
    tracking: exerciseTrack("tracking").notNull().default("reps"),
    ...timestamps,
  },
  (t) => [unique("exercises_source_unique").on(t.source, t.sourceId)],
);

// ───────── templates ("Regulars") ─────────

export const workoutTemplates = pgTable(
  "workout_templates",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: activityType("type").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
    /** Run/walk templates only. */
    targetDistanceM: integer("target_distance_m"),
    /** Run/walk templates only. */
    targetDurationSec: integer("target_duration_sec"),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("workout_templates_user_idx").on(t.userId, t.type)],
);

export const templateExercises = pgTable(
  "template_exercises",
  {
    id: id(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: smallint("position").notNull(),
    targetSets: smallint("target_sets").notNull().default(3),
    targetReps: smallint("target_reps"),
    targetDurationSec: integer("target_duration_sec"),
    targetWeightKg: numeric("target_weight_kg", { precision: 6, scale: 2, mode: "number" }),
    ...timestamps,
  },
  (t) => [unique("template_exercises_position_unique").on(t.templateId, t.position)],
);

// ───────── activity log ─────────

export const activities = pgTable(
  "activities",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: activityType("type").notNull(),
    /** User's local calendar date (YYYY-MM-DD), never a UTC timestamp. */
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("start_time"),
    durationSec: integer("duration_sec"),
    notes: text("notes"),
    feel: feelLevel("feel"),
    distanceM: integer("distance_m"),
    avgHeartRate: smallint("avg_heart_rate"),
    templateId: uuid("template_id").references(() => workoutTemplates.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("activities_user_date_idx").on(t.userId, t.date)],
);

export const activityExercises = pgTable(
  "activity_exercises",
  {
    id: id(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: smallint("position").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [unique("activity_exercises_position_unique").on(t.activityId, t.position)],
);

export const exerciseSets = pgTable(
  "exercise_sets",
  {
    id: id(),
    activityExerciseId: uuid("activity_exercise_id")
      .notNull()
      .references(() => activityExercises.id, { onDelete: "cascade" }),
    setNumber: smallint("set_number").notNull(),
    reps: smallint("reps"),
    durationSec: integer("duration_sec"),
    /** null = bodyweight */
    weightKg: numeric("weight_kg", { precision: 6, scale: 2, mode: "number" }),
    ...timestamps,
  },
  (t) => [unique("exercise_sets_set_number_unique").on(t.activityExerciseId, t.setNumber)],
);

// ───────── cycle ─────────

export const periodDays = pgTable(
  "period_days",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    flow: flowLevel("flow"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

// ───────── settings ─────────

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  weightUnit: text("weight_unit").$type<"kg" | "lb">().notNull().default("kg"),
  distanceUnit: text("distance_unit").$type<"km" | "mi">().notNull().default("km"),
  /** 0 = Sunday … 6 = Saturday */
  weekStartsOn: smallint("week_starts_on").notNull().default(1),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  defaultCycleLen: smallint("default_cycle_len").notNull().default(28),
  defaultPeriodLen: smallint("default_period_len").notNull().default(5),
  cyclePredictionsOn: boolean("cycle_predictions_on").notNull().default(true),
  ...timestamps,
});

// ───────── derived ─────────

/** "Used 12×" — derived from activities.template_id, never stored. */
export const workoutTemplateUsage = pgView("workout_template_usage", {
  templateId: uuid("template_id").notNull(),
  userId: uuid("user_id").notNull(),
  usedCount: integer("used_count").notNull(),
  lastUsedOn: date("last_used_on", { mode: "string" }),
}).existing();

export const tables = {
  exercises,
  workoutTemplates,
  templateExercises,
  activities,
  activityExercises,
  exerciseSets,
  periodDays,
  userSettings,
} as const;

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;
export type TemplateExercise = typeof templateExercises.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type ActivityExercise = typeof activityExercises.$inferSelect;
export type ExerciseSet = typeof exerciseSets.$inferSelect;
export type PeriodDay = typeof periodDays.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
