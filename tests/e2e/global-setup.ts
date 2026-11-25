import { mkdirSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const STATE = "tests/e2e/.auth/user.json";

/**
 * Signs a fresh test user in through the app's real magic-link callback:
 * the Supabase admin API mints a magic-link token for a new user, and the
 * browser opens /auth/callback?token_hash=…, exactly like clicking the email.
 *
 *   NEXT_PUBLIC_SUPABASE_URL   local stack URL
 *   SUPABASE_SERVICE_ROLE_KEY  `supabase status -o env` → SERVICE_ROLE_KEY
 *
 * E2E_STORAGE_STATE=<file> skips this and uses a prepared signed-in state.
 */
export default async function globalSetup(config: FullConfig) {
  mkdirSync(dirname(STATE), { recursive: true });
  if (process.env.E2E_STORAGE_STATE) {
    copyFileSync(process.env.E2E_STORAGE_STATE, STATE);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY (from `supabase status -o env`) for e2e sign-in");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `e2e-${Date.now()}@test.gritgirl.local`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;

  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(
    `${baseURL}/auth/callback?token_hash=${encodeURIComponent(link.data.properties.hashed_token)}&type=magiclink`,
  );
  await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
  await page.context().storageState({ path: STATE });
  await browser.close();
}
