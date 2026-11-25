import { sql } from "drizzle-orm";
import type { Db } from "./client";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Runs `fn` in a transaction as Supabase's `authenticated` role with the
 * given user's JWT claims, so auth.uid() and every RLS policy apply exactly
 * as they do for a request made with that user's token.
 */
export async function asUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
