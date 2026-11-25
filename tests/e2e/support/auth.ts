import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Test users for e2e. Uses the local stack's service-role key (from
 * SUPABASE_SERVICE_ROLE_KEY or `supabase status`) to create a confirmed user
 * and mint a magic-link token, then signs in through the app's real
 * /auth/callback route, exactly like clicking the emailed link.
 */

function localStatus(): Record<string, string | undefined> {
  const raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(raw.slice(raw.indexOf("{")));
}

let admin: SupabaseClient | null = null;

function adminClient(): SupabaseClient {
  if (admin) return admin;
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const s = localStatus();
    url ??= s.API_URL;
    key ??= s.SECRET_KEY ?? s.SERVICE_ROLE_KEY;
  }
  if (!url || !key) throw new Error("Need a running local Supabase (pnpm db:start) for e2e tests");
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export interface TestUser {
  id: string;
  email: string;
  remove: () => Promise<void>;
}

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `e2e-${label}-${randomUUID().slice(0, 8)}@test.gritgirl.local`;
  const { data, error } = await adminClient().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const id = data.user.id;
  return { id, email, remove: async () => void (await adminClient().auth.admin.deleteUser(id)) };
}

/** Signs `user` in through /auth/callback, landing on `next` (or onboarding). */
export async function signIn(page: Page, user: TestUser, next = "/") {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (error || !data.properties?.hashed_token) throw new Error(`generateLink failed: ${error?.message}`);
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
    next,
  });
  await page.goto(`/auth/callback?${params}`);
}
