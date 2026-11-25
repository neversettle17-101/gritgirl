-- Grit Girl — M1 foundation, part 1: extensions, enum types, shared helpers.
-- Technical design §5 (schema) + §0 decisions log.

-- Trigram search on exercise names ("squt" → "Squat"). Supabase keeps
-- extensions in the `extensions` schema.
create extension if not exists pg_trgm with schema extensions;

create type public.activity_type as enum ('running', 'walking', 'strength');

-- Logging-form hint only; every set can still store reps, time and weight.
create type public.exercise_track as enum ('reps', 'time');

create type public.flow_level as enum ('spotting', 'light', 'medium', 'heavy');

-- Optional "how did it feel" rating on every activity (the mockup's
-- "spice level"). Ordered from easiest to hardest, so `order by feel` and
-- comparisons (feel >= 'spicy') work as expected.
create type public.feel_level as enum ('breezy', 'easy', 'solid', 'spicy', 'wrecked');

-- Keeps updated_at current on every table.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
