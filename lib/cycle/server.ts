import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_PATH, onboardingRedirect } from "./onboarding";
import { ApiError, type CycleRepo, type Settings } from "./service";
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

/**
 * For signed-in pages: returns the repo and settings, or redirects to
 * /sign-in (signed out) or /onboarding (onboarding not finished).
 * Call it inside a <Suspense> boundary (it reads the session cookie).
 */
export async function requireOnboarded(path: string): Promise<{ repo: CycleRepo; settings: Settings }> {
  const ctx = await currentCycleRepo();
  if (!ctx) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  const settings = await ctx.repo.getSettings();
  const to = onboardingRedirect(settings, path);
  if (to || !settings) redirect(to ?? ONBOARDING_PATH);
  return { repo: ctx.repo, settings };
}
