import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (technical design §14): phone and desktop viewports
 * against `next start` and a local Supabase stack (`pnpm db:start`).
 * Run: pnpm build && pnpm test:e2e
 */
const CI = Boolean(process.env.CI);
const PORT = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    // localhost (not 127.0.0.1) to match supabase/config.toml site_url.
    baseURL: `http://localhost:${PORT}`,
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
