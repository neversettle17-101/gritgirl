import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
// Default to the Supabase CLI's local database.
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
