"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/safe-next";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { magicLinkSchema } from "@/lib/validation/auth";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function callbackUrl(origin: string, next: string): string {
  const url = new URL("/auth/callback", origin);
  if (next !== "/") url.searchParams.set("next", next);
  return url.toString();
}

export async function sendMagicLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const next = safeNextPath(parsed.data.next);
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl(await siteOrigin(), next) },
  });
  if (error) {
    // Never log the request body / email (cycle data is sensitive; see §11).
    return { status: "error", message: "Could not send the link. Try again in a minute." };
  }
  return { status: "sent", email: parsed.data.email };
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  if (!publicEnv().NEXT_PUBLIC_AUTH_GOOGLE_ENABLED) {
    redirect("/sign-in?error=google_disabled");
  }
  const supabase = await createClient();
  const next = safeNextPath(formData.get("next")?.toString());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(await siteOrigin(), next) },
  });
  if (error || !data.url) redirect("/sign-in?error=oauth");
  redirect(data.url);
}
