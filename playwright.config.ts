import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (technical design §14), phone viewport.
 *
 * Needs a running Supabase (pnpm db:start + seed) and, for sign-in, the
 * service-role key in SUPABASE_SERVICE_ROLE_KEY (see tests/e2e/global-setup.ts).
 * By default it builds nothing and starts `pnpm start` on :3000, so run
 * `pnpm build` first; set E2E_BASE_URL to test an already running server.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    storageState: "tests/e2e/.auth/user.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
