import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { mapFreeExercise, type LibraryExerciseRow } from "@/lib/domain/exercises";
import { freeExerciseRecordSchema } from "@/lib/validation/free-exercise-db";
import type { Db } from "./client";
import { exercises } from "./schema";

export const VENDORED_EXERCISES_PATH = path.join(
  process.cwd(),
  "data/vendor/free-exercise-db/exercises.json",
);

export interface SeedResult {
  total: number;
  valid: number;
  skipped: { index: number; id?: unknown; reason: string }[];
  inserted: number;
  updated: number;
  unchanged: number;
}

/** Validate raw records; bad rows are reported, never fatal. */
export function prepareRows(raw: unknown): {
  rows: LibraryExerciseRow[];
  skipped: SeedResult["skipped"];
  total: number;
} {
  if (!Array.isArray(raw)) throw new Error("exercises.json must contain a JSON array");
  const rows: LibraryExerciseRow[] = [];
  const skipped: SeedResult["skipped"] = [];
  const seen = new Set<string>();
  raw.forEach((rec, index) => {
    const parsed = freeExerciseRecordSchema.safeParse(rec);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      skipped.push({
        index,
        id: (rec as { id?: unknown } | null)?.id,
        reason: `${issue?.path.join(".") || "record"}: ${issue?.message ?? "invalid"}`,
      });
      return;
    }
    if (seen.has(parsed.data.id)) {
      skipped.push({ index, id: parsed.data.id, reason: "duplicate id" });
      return;
    }
    seen.add(parsed.data.id);
    rows.push(mapFreeExercise(parsed.data));
  });
  return { rows, skipped, total: raw.length };
}

const CHUNK = 200;

/**
 * Idempotent upsert keyed on (source, source_id). Rows whose content is
 * unchanged are not rewritten, so re-running is a no-op.
 */
export async function seedExercises(db: Db, raw: unknown): Promise<SeedResult> {
  const { rows, skipped, total } = prepareRows(raw);
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = await db
      .insert(exercises)
      .values(chunk)
      .onConflictDoUpdate({
        target: [exercises.source, exercises.sourceId],
        set: {
          name: sql`excluded.name`,
          category: sql`excluded.category`,
          equipment: sql`excluded.equipment`,
          primaryMuscles: sql`excluded.primary_muscles`,
          secondaryMuscles: sql`excluded.secondary_muscles`,
          instructions: sql`excluded.instructions`,
          imagePaths: sql`excluded.image_paths`,
          tracking: sql`excluded.tracking`,
        },
        setWhere: sql`(
          ${exercises.name}, ${exercises.category}, ${exercises.equipment},
          ${exercises.primaryMuscles}, ${exercises.secondaryMuscles},
          ${exercises.instructions}, ${exercises.imagePaths}, ${exercises.tracking}
        ) is distinct from (
          excluded.name, excluded.category, excluded.equipment,
          excluded.primary_muscles, excluded.secondary_muscles,
          excluded.instructions, excluded.image_paths, excluded.tracking
        )`,
      })
      // xmax = 0 means the row version was freshly inserted, not updated.
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    for (const r of result) {
      if (r.inserted) inserted++;
      else updated++;
    }
  }

  return {
    total,
    valid: rows.length,
    skipped,
    inserted,
    updated,
    unchanged: rows.length - inserted - updated,
  };
}

export async function readVendoredExercises(file = VENDORED_EXERCISES_PATH): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}
