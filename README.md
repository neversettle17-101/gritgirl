# Grit Girl

Log runs, walks and strength sessions, and see them alongside your cycle phase
on Day / Week / Month ledgers. One responsive web app (installable as a PWA).

Stack: Next.js 16 (App Router) + TypeScript (strict) · Tailwind CSS 4 ·
Supabase (Postgres, Auth, Row-Level Security) · Drizzle ORM over SQL
migrations · Zod · Vitest · pnpm · GitHub Actions.

## Prerequisites

- Node 22+ (24 recommended) and pnpm (`corepack enable`)
- Docker (Docker Desktop, OrbStack or Colima), running, for local Supabase

The Supabase CLI is a dev dependency, so you run it with `pnpm exec supabase …`
(or through the `pnpm db:*` scripts). No global install is needed.

## Run locally

```bash
pnpm install

# 1. Start local Supabase (Postgres, Auth, Mailpit). The first run pulls Docker images.
#    It also applies every migration in db/migrations to the fresh database.
pnpm db:start

# 2. Write .env.local from the running stack (URL, publishable key, DB URL)
pnpm env:local

# 3. Migrations: already applied by db:start. Afterwards use
pnpm db:migrate        # apply new migrations to the running DB
pnpm db:reset          # drop everything and re-apply all migrations from scratch

# 4. Import the exercise library (~876 exercises). Safe to re-run.
pnpm seed:exercises

# 5. Run the app
pnpm dev               # http://localhost:3000
```

### Signing in locally

Sign-in uses an email magic link. Local Supabase does not send real email.
Open **Mailpit** at <http://127.0.0.1:54324>, find the message and click the
link. Use `http://localhost:3000` (not `127.0.0.1`) so the link's redirect
matches `site_url` in `supabase/config.toml`.

Google sign-in is wired up but disabled locally. To try it:

1. Create OAuth credentials.
2. Export `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
3. Set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`.
4. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` in `.env.local`.
5. Run `pnpm db:stop && pnpm db:start`.

Other local URLs: Supabase Studio <http://127.0.0.1:54323>, API
<http://127.0.0.1:54321>, Postgres `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests: `tests/unit/**/*.test.ts` and `lib/**/*.test.ts` |
| `pnpm test:db` | DB tests in `tests/db/` (needs `db:start` running): RLS isolation, constraints, seed idempotency, schema drift, the activity save/search functions, template (Regulars) save, archive and usage counts, per-exercise progress |
| `pnpm test:e2e` | Playwright happy paths in `tests/e2e/` (phone viewport). Needs the stack running + seeded, `pnpm build`, and `SUPABASE_SERVICE_ROLE_KEY` from `pnpm exec supabase status -o env` (used to mint a magic-link sign-in for a fresh test user). First time: `pnpm exec playwright install chromium` |
| `pnpm db:start` / `db:stop` / `db:status` | Local Supabase stack |
| `pnpm db:migrate` / `db:reset` | Apply pending migrations / rebuild the DB from scratch |
| `pnpm seed:exercises` | Import `data/vendor/free-exercise-db/exercises.json` |
| `pnpm env:local` | Generate `.env.local` from `supabase status` |

## Repository layout

```
app/                       Next.js routes (pages, route handlers, server actions)
components/                UI components
proxy.ts                   Request proxy (Next 16's name for middleware): session refresh + route protection
lib/domain/                Pure business logic, unit-tested
lib/db/                    Drizzle schema (mirror of the SQL), client, RLS helper, seed logic
lib/validation/            Zod schemas shared by API and forms
lib/supabase/              Supabase clients (server, browser, proxy)
db/migrations/             SQL migrations (schema, RLS). supabase/migrations is a symlink to this folder
supabase/config.toml       Local Supabase config
data/vendor/free-exercise-db/  Pinned exercises.json + LICENSE.md (The Unlicense)
scripts/                   seed-exercises.ts, write-local-env.ts
tests/unit/  tests/db/     Vitest suites
tests/e2e/                 Playwright end-to-end tests
```

## Database

The SQL in `db/migrations/` is the source of truth. Add a migration with
`pnpm exec supabase migration new <name>`, which writes into `db/migrations`
through the symlink. Then mirror the change in `lib/db/schema.ts`.
`tests/db/schema-drift.test.ts` fails if the two disagree.

Notes on the schema decisions:

- **SI units, local dates.** Distances are stored in metres, times in seconds,
  weights in kg. `activities.date` is the user's local calendar date.
- **Derived values are never stored.** That covers phases, pace, totals, streaks and template usage.
- **`activities.feel`.** Optional enum `feel_level` (`breezy` · `easy` · `solid` ·
  `spicy` · `wrecked`), the mockup's "spice level". It is an ordered enum rather
  than a 1–5 integer, so values are self-describing and still sort and compare
  in order.
- **Templates ("Regulars") for all three types.** `workout_templates.type` sets the
  type. Run/walk templates use `target_distance_m` and `target_duration_sec`.
  Strength templates use `template_exercises`. A check constraint keeps cardio
  targets off strength templates, and a trigger keeps exercises off run/walk templates.
- **Usage count ("used 12×") is derived, not stored.** It comes from the
  `workout_template_usage` view, which counts `activities.template_id`. The view
  uses `security_invoker`, so RLS applies.
- **Template deletion.** `activities.template_id` references
  `workout_templates` with `on delete set null`, so past workouts keep their data.
- **RLS on every table.** Users only touch their own rows. Child tables check
  ownership through their parent. Library exercises are readable by every
  signed-in user. Library rows can only be written by the seed script. The
  `anon` role has no access.
- **Account deletion.** Deleting an account (`auth.users`) cascades to all of the user's data.
  The `exercise_id` foreign keys on `activity_exercises` and `template_exercises` are
  `deferrable initially deferred`, so they are checked at commit. That lets the
  cascade remove a user's custom exercises along with the rows that use them.
  Deleting a custom exercise that is still in use is still rejected.
- **Default settings.** Every new user automatically gets a `user_settings` row.

The app talks to the database with the signed-in user's JWT (supabase-js, or
Drizzle inside `asUser()` from `lib/db/rls.ts`), so RLS always applies. The
direct `DATABASE_URL` connection bypasses RLS and is only for the seed
script and tests.

## Activity logging (API)

Route handlers under `app/api` (technical design §10). All need a session and
answer errors as `{ error: { code, message, fields? } }`.

| Method & path | Purpose |
| --- | --- |
| `GET /api/activities?from=&to=` | Activities in a date range (≤ 400 days), with exercises and sets |
| `POST /api/activities` | Create a run, walk or strength workout (client-generated `id`) |
| `GET / PUT / DELETE /api/activities/:id` | Read, replace, delete one activity |
| `GET /api/exercises?q=&muscle=&equipment=&limit=` | Typo-tolerant search of the library + my custom exercises |
| `POST /api/exercises` | Create a custom exercise |
| `GET /api/exercises/:id/last` | My most recent sets for an exercise (pre-fill) |
| `GET /api/board?view=day\|week\|month\|year&date=` | Ledger payload: per-day minutes/distance/strength volume by type, activity summaries, totals, streaks (day view adds full activities) |
| `GET / PATCH /api/profile` | My name, height (cm), date of birth, units and week start, plus recent weigh-ins; PATCH any subset (null clears) |
| `GET / POST /api/body-weight` | Recent weigh-ins; log one (kg, one per day: same date replaces) |
| `DELETE /api/body-weight/:id` | Remove a weigh-in |

Requests run through supabase-js with the user's JWT, so RLS always applies.
Saving a strength workout (activity + exercises + sets) and replacing one on
edit happen inside the `save_activity` database function, which runs as one
transaction (`db/migrations/20261125000004_activity_functions.sql`). Search is
`search_exercises` (pg_trgm); pre-fill is `exercise_last_sets`. All three are
`security invoker`. Bodies are validated with the Zod schemas in
`lib/validation/`, which the forms reuse. Units: the forms show kg/lb and km/mi
from `user_settings` and convert to SI (`lib/domain/units.ts`).

The strength slip keeps its draft in `localStorage`, so a reload never loses
a workout. Deleting shows an UNDO toast for 5 seconds before the DELETE is sent.

## Exercise library

`data/vendor/free-exercise-db/` holds a pinned copy of
[free-exercise-db](https://github.com/yuhonas/free-exercise-db), which is public
domain (The Unlicense). See the README in that folder. `scripts/seed-exercises.ts` does the import:

1. Validates each record with Zod. Bad rows are skipped and logged.
2. Maps each record to `public.exercises`.
3. Upserts on `(source, source_id)`, only rewriting rows whose content changed.

Exercises with `force = "static"` (plank, side bridge, isometric holds, static
stretches) get `tracking = 'time'`. All others get `reps`. Search uses a
`pg_trgm` GIN index on `name`, which makes it typo-tolerant.

## CI

`.github/workflows/ci.yml` has two jobs:

- **Checks:** typecheck, lint, unit tests, production build.
- **Database:** starts a fresh local Supabase in the runner, applies all
  migrations (`supabase start` + `supabase db reset`), runs `supabase db lint`,
  seeds the exercises and runs the DB test suite.
