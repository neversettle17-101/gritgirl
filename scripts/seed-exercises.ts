/**
 * Imports the vendored free-exercise-db library into public.exercises.
 *
 *   pnpm seed:exercises            # uses DATABASE_URL from .env / .env.local
 *
 * Safe to re-run: upserts on (source, source_id) and never duplicates.
 * Connects directly as the database owner (bypasses RLS) because library rows
 * have no owner — this is the only place privileged credentials are used.
 */
import { config } from "dotenv";
import { createDb } from "@/lib/db/client";
import { readVendoredExercises, seedExercises } from "@/lib/db/seed-exercises";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { db, close } = createDb();
  try {
    const raw = await readVendoredExercises();
    const result = await seedExercises(db, raw);
    for (const s of result.skipped) {
      console.warn(`skipped record #${s.index} (${String(s.id ?? "?")}): ${s.reason}`);
    }
    console.log(
      `free-exercise-db: ${result.total} records, ${result.valid} valid, ` +
        `${result.inserted} inserted, ${result.updated} updated, ` +
        `${result.unchanged} unchanged, ${result.skipped.length} skipped`,
    );
  } finally {
    await close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
