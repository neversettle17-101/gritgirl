import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * Direct Postgres connection. Connects as the role in DATABASE_URL, which
 * locally is `postgres` and BYPASSES RLS. Use it for the seed script and
 * tests; run anything on behalf of a user inside `asUser()` (./rls.ts).
 */
export function createDb(url = process.env.DATABASE_URL, options: postgres.Options<Record<string, postgres.PostgresType>> = {}) {
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  const client = postgres(url, { max: 5, prepare: false, onnotice: () => {}, ...options });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}
