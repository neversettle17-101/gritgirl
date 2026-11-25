import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/api/session";
import { getUserPrefs, type UserPrefs } from "./repo";

/**
 * For Server Components: the signed-in user's client and preferences.
 * Reads cookies, so call it inside a <Suspense> boundary. The proxy already
 * redirects signed-out visitors; this is the fallback.
 *
 * Everything after this depends on the user and the current time ("today"
 * in their time zone), so it always renders at request time.
 */
export async function requirePageSession(): Promise<{ supabase: SupabaseClient; userId: string; prefs: UserPrefs }> {
  await connection();
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const prefs = await getUserPrefs(session.supabase);
  return { ...session, prefs };
}
