/**
 * Writes .env.local from the running local Supabase stack.
 *   pnpm env:local
 * Refuses to overwrite an existing .env.local unless --force is passed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

const force = process.argv.includes("--force");
if (existsSync(".env.local") && !force) {
  console.error(".env.local already exists (use --force to overwrite)");
  process.exit(1);
}

const raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
const status = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, string | undefined>;
const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
if (!status.API_URL || !key || !status.DB_URL) {
  console.error("Could not read API_URL / PUBLISHABLE_KEY / DB_URL from `supabase status`. Is it running?");
  process.exit(1);
}

writeFileSync(
  ".env.local",
  [
    `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}`,
    "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false",
    `DATABASE_URL=${status.DB_URL}`,
    "",
  ].join("\n"),
);
console.log("Wrote .env.local");
