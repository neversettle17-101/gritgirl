import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests: need `supabase start` (+ migrations) and DATABASE_URL.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    setupFiles: ["tests/db/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
