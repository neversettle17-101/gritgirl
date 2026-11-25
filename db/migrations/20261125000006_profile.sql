-- Grit Girl — Profile: about-you details and dated body-weight entries.
--
-- Canonical units as everywhere else: centimetres and kilograms. The app
-- converts to the user's units (user_settings.weight_unit / distance_unit)
-- for display and entry. Every new field is optional.
--
-- The ranges below are the hard floor/ceiling; the API validates the same
-- ranges (and that a date of birth / weigh-in is not in the future, which a
-- CHECK constraint cannot express because it depends on the current date).

-- ───────────────────────── user_settings: about you ─────────────────────────

alter table public.user_settings
  add column display_name  text null,
  add column height_cm     numeric(4, 1) null,
  add column date_of_birth date null,

  add constraint user_settings_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  add constraint user_settings_height_cm
    check (height_cm is null or height_cm between 50 and 272),
  add constraint user_settings_date_of_birth
    check (date_of_birth is null or date_of_birth >= date '1900-01-01');

-- ───────────────────────── body weight ─────────────────────────
-- One weigh-in per user per local calendar day; logging again that day
-- replaces it (the API upserts on (user_id, measured_on)). The latest entry
-- is the "current" weight.

create table public.body_weight_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg   numeric(5, 2) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint body_weight_entries_one_per_day unique (user_id, measured_on),
  constraint body_weight_entries_weight_kg check (weight_kg between 20 and 400),
  constraint body_weight_entries_measured_on check (measured_on >= date '1900-01-01')
);

create trigger body_weight_entries_set_updated_at before update on public.body_weight_entries
  for each row execute function public.set_updated_at();

-- ───────── RLS: owner only ─────────

alter table public.body_weight_entries enable row level security;

revoke all on public.body_weight_entries from anon;

create policy body_weight_entries_owner on public.body_weight_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
