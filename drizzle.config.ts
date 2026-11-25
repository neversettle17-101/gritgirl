import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// SQL in db/migrations is the source of truth and is applied by the Supabase
// CLI. drizzle-kit is only used for `pnpm db:studio` / `drizzle-kit pull`
// comparisons — do not use `drizzle-kit generate/push`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./db/drizzle",
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
});
