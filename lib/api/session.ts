import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's Supabase client and id for a route handler, or null.
 * The proxy already turns signed-out /api requests into 401s; this is the
 * handler's own check (defence in depth, and it needs the user id anyway).
 */
export async function getSession(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return { supabase, userId };
}
