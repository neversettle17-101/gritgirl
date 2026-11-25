import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ApiError, type CycleRepo } from "./service";
import { createSupabaseCycleRepo } from "./supabase-repo";

/** The signed-in user's cycle repo (RLS-scoped), or null when signed out. */
export async function currentCycleRepo(): Promise<{ userId: string; repo: CycleRepo } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return { userId, repo: createSupabaseCycleRepo(supabase, userId) };
}

/** Same as currentCycleRepo() but throws a 401 ApiError when signed out (route handlers). */
export async function requireCycleRepo(): Promise<CycleRepo> {
  const ctx = await currentCycleRepo();
  if (!ctx) throw new ApiError(401, "unauthorized", "Sign in required");
  return ctx.repo;
}
