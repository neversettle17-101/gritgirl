import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/auth/safe-next";
import { onboardingRedirect } from "@/lib/cycle/onboarding";
import { createSupabaseCycleRepo } from "@/lib/cycle/supabase-repo";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for magic links and OAuth. Handles both the PKCE `code`
 * flow and the `token_hash` email-template flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  let userId: string | undefined;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) userId = data.user?.id;
  }
  if (!userId) return NextResponse.redirect(new URL("/sign-in?error=auth", origin));

  // First sign-in: send the user through onboarding before anything else.
  let target = next;
  try {
    const settings = await createSupabaseCycleRepo(supabase, userId).getSettings();
    target = onboardingRedirect(settings, next) ?? next;
  } catch {
    // Settings unavailable: let the user in; pages re-check onboarding.
  }
  return NextResponse.redirect(new URL(target, origin));
}
