import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { expect } from "vitest";
import { createDb, type Db } from "@/lib/db/client";
import { authUsers } from "drizzle-orm/supabase";

export { asUser } from "@/lib/db/rls";

export function connect() {
  return createDb(process.env.DATABASE_URL, { max: 3 });
}

/** Creates a confirmed auth user directly in auth.users (as the DB owner). */
export async function createUser(db: Db, label = "user"): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`
    insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated',
            ${`${label}-${id.slice(0, 8)}@test.gritgirl.local`}, now(), now(), now())
  `);
  return id;
}

export async function deleteUsers(db: Db, ids: string[]) {
  if (ids.length) await db.delete(authUsers).where(inArray(authUsers.id, ids));
}

interface PgErrorLike {
  code?: string;
  constraint_name?: string;
  message?: string;
}

function pgError(err: unknown): PgErrorLike {
  // drizzle wraps driver errors; the postgres.js error is on `cause`.
  let e = err as { cause?: unknown } & PgErrorLike;
  while (e && !e.code && e.cause) e = e.cause as typeof e;
  return e;
}

/**
 * Asserts the promise fails with a Postgres error.
 *   23514 check_violation · 23503 foreign_key_violation · 23505 unique_violation
 *   42501 insufficient_privilege / RLS violation · 23502 not_null_violation
 */
export async function expectPgError(
  p: Promise<unknown>,
  expected: { code: string; constraint?: string; message?: RegExp },
) {
  let caught: unknown;
  try {
    await p;
  } catch (err) {
    caught = err;
  }
  expect(caught, "expected the query to fail").toBeDefined();
  const e = pgError(caught);
  expect(e.code).toBe(expected.code);
  if (expected.constraint) expect(e.constraint_name).toBe(expected.constraint);
  if (expected.message) expect(e.message).toMatch(expected.message);
}

export const RLS_VIOLATION = "42501";
