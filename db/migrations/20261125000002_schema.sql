-- Grit Girl — M1 foundation, part 2: tables, constraints, indexes, triggers.
--
-- Conventions
--   * uuid primary keys are generated on the client (offline-safe); the
--     gen_random_uuid() default is only a fallback for server-side inserts.
--   * SI units: metres, seconds, kilograms. Converted only for display.
--   * Raw facts only. Phases, pace, totals, streaks and template usage counts
--     are derived at read time, never stored.
--   * Every user-owned row cascades from auth.users, so deleting an account
--     removes all of its data (§11).
--   * Tables are created parent-first, so every foreign key is declared inline
--     (activities.template_id → workout_templates needs no deferred ALTER).

-- ───────────────────────── reference / library ─────────────────────────

create table public.exercises (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid null references auth.users (id) on delete cascade, -- null = shared library
  source            text not null,                                          -- 'free-exercise-db' | 'custom'
  source_id         text null,
  name              text not null,
  category          text null,
  equipment         text null,
  primary_muscles   text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  instructions      text[] not null default '{}',
  image_paths       text[] not null default '{}',
  tracking          public.exercise_track not null default 'reps',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint exercises_source_unique unique (source, source_id),
  constraint exercises_source_known check (source in ('free-exercise-db', 'custom')),
  constraint exercises_name_length check (char_length(btrim(name)) between 1 and 200),
  -- Library rows: no owner, upstream id. Custom rows: an owner, no upstream id.
  constraint exercises_library_or_custom check (
    (source = 'custom' and owner_user_id is not null and source_id is null)
    or (source <> 'custom' and owner_user_id is null and source_id is not null)
  )
);

create index exercises_name_trgm_idx on public.exercises using gin (name extensions.gin_trgm_ops);
create index exercises_owner_idx on public.exercises (owner_user_id) where owner_user_id is not null;

-- ───────────────────────── templates ("Regulars") ─────────────────────────
-- One table for all three activity types. Run/walk templates carry target
-- distance and duration; strength templates carry ordered exercises in
-- template_exercises. Usage count ("used 12×") is derived from
-- activities.template_id — see view workout_template_usage below.

create table public.workout_templates (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  type                public.activity_type not null,
  name                text not null,
  notes               text null,
  target_distance_m   int null,
  target_duration_sec int null,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint workout_templates_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint workout_templates_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint workout_templates_target_distance_positive check (target_distance_m > 0),
  constraint workout_templates_target_duration_positive check (target_duration_sec > 0),
  constraint workout_templates_cardio_targets_only_for_cardio check (
    type in ('running', 'walking')
    or (target_distance_m is null and target_duration_sec is null)
  )
);

create index workout_templates_user_idx on public.workout_templates (user_id, type) where not archived;

create table public.template_exercises (
  id                  uuid primary key default gen_random_uuid(),
  template_id         uuid not null references public.workout_templates (id) on delete cascade,
  -- Deferred: checked at commit, so deleting an account can cascade away the
  -- user's custom exercises and the rows that use them in one statement.
  -- Deleting a custom exercise that is still in use is still rejected.
  exercise_id         uuid not null references public.exercises (id) deferrable initially deferred,
  position            smallint not null,
  target_sets         smallint not null default 3,
  target_reps         smallint null,
  target_duration_sec int null,
  target_weight_kg    numeric(6, 2) null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint template_exercises_position_unique unique (template_id, position),
  constraint template_exercises_position_positive check (position > 0),
  constraint template_exercises_target_sets_positive check (target_sets > 0),
  constraint template_exercises_target_reps_positive check (target_reps > 0),
  constraint template_exercises_target_duration_positive check (target_duration_sec > 0),
  constraint template_exercises_target_weight_nonnegative check (target_weight_kg >= 0)
);

create index template_exercises_exercise_idx on public.template_exercises (exercise_id);

-- ───────────────────────── activity log ─────────────────────────
-- One row per run / walk / strength workout.

create table public.activities (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  type           public.activity_type not null,
  date           date not null,                 -- user's local calendar date
  start_time     time null,
  duration_sec   int null,
  notes          text null,
  feel           public.feel_level null,
  -- running / walking
  distance_m     int null,
  avg_heart_rate smallint null,
  -- the Regular this was started from (any type)
  template_id    uuid null references public.workout_templates (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint activities_duration_positive check (duration_sec > 0),
  constraint activities_distance_positive check (distance_m > 0),
  constraint activities_avg_heart_rate_range check (avg_heart_rate between 30 and 230),
  constraint activities_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint activities_cardio_fields_only_for_cardio check (
    type in ('running', 'walking') or (distance_m is null and avg_heart_rate is null)
  ),
  -- Duration is required for runs and walks; strength may fall back to set times.
  constraint activities_cardio_requires_duration check (
    type = 'strength' or duration_sec is not null
  )
);

create index activities_user_date_idx on public.activities (user_id, date);
create index activities_template_idx on public.activities (template_id) where template_id is not null;

create table public.activity_exercises (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  -- Deferred for the same reason as template_exercises.exercise_id.
  exercise_id uuid not null references public.exercises (id) deferrable initially deferred,
  position    smallint not null,
  notes       text null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint activity_exercises_position_unique unique (activity_id, position),
  constraint activity_exercises_position_positive check (position > 0),
  constraint activity_exercises_notes_length check (notes is null or char_length(notes) <= 2000)
);

create index activity_exercises_exercise_idx on public.activity_exercises (exercise_id);

create table public.exercise_sets (
  id                   uuid primary key default gen_random_uuid(),
  activity_exercise_id uuid not null references public.activity_exercises (id) on delete cascade,
  set_number           smallint not null,
  reps                 smallint null,
  duration_sec         int null,            -- per-set time
  weight_kg            numeric(6, 2) null,  -- optional; null = bodyweight
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint exercise_sets_set_number_unique unique (activity_exercise_id, set_number),
  constraint exercise_sets_set_number_positive check (set_number > 0),
  constraint exercise_sets_reps_positive check (reps > 0),
  constraint exercise_sets_duration_positive check (duration_sec > 0),
  constraint exercise_sets_weight_nonnegative check (weight_kg >= 0),
  constraint set_has_reps_or_time check (reps is not null or duration_sec is not null)
);

-- ───────────────────────── cycle ─────────────────────────

create table public.period_days (
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  flow       public.flow_level null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ───────────────────────── settings ─────────────────────────

create table public.user_settings (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  weight_unit          text not null default 'kg',
  distance_unit        text not null default 'km',
  week_starts_on       smallint not null default 1,   -- 0 = Sun, 1 = Mon … 6 = Sat
  timezone             text not null default 'Asia/Kolkata',
  default_cycle_len    smallint not null default 28,
  default_period_len   smallint not null default 5,
  cycle_predictions_on boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint user_settings_weight_unit check (weight_unit in ('kg', 'lb')),
  constraint user_settings_distance_unit check (distance_unit in ('km', 'mi')),
  constraint user_settings_week_starts_on check (week_starts_on between 0 and 6),
  -- Same plausible range the phase engine accepts for observed cycles (§9).
  constraint user_settings_cycle_len check (default_cycle_len between 15 and 60),
  constraint user_settings_period_len check (default_period_len between 1 and 15)
);

-- ───────────────────────── derived: template usage ─────────────────────────
-- "Used 12×" on the Regulars screen. Derived rather than stored so editing
-- or deleting an activity can never leave a stale counter. security_invoker
-- makes the view run with the caller's RLS.

create view public.workout_template_usage
with (security_invoker = true) as
select
  t.id                 as template_id,
  t.user_id            as user_id,
  count(a.id)::int     as used_count,
  max(a.date)          as last_used_on
from public.workout_templates t
left join public.activities a on a.template_id = t.id
group by t.id, t.user_id;

-- ───────────────────────── integrity triggers ─────────────────────────
-- Exercises and sets only belong to strength workouts/templates. These are
-- cross-table rules, which CHECK constraints cannot express. The two parent
-- lookups run as security definer so they see the parent regardless of RLS;
-- ownership itself is still enforced by the RLS policies (which then reject
-- cross-user writes with an RLS error rather than this check).

create function public.assert_strength_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.activities a
    where a.id = new.activity_id and a.type = 'strength'
  ) then
    raise exception 'activity_exercises.activity_id must reference a strength activity'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.assert_strength_activity() from public, anon, authenticated;

create trigger activity_exercises_strength_only
before insert or update of activity_id on public.activity_exercises
for each row execute function public.assert_strength_activity();

create function public.assert_strength_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.workout_templates t
    where t.id = new.template_id and t.type = 'strength'
  ) then
    raise exception 'template_exercises.template_id must reference a strength template'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.assert_strength_template() from public, anon, authenticated;

create trigger template_exercises_strength_only
before insert or update of template_id on public.template_exercises
for each row execute function public.assert_strength_template();

-- Changing a parent's type away from strength while it still has exercises
-- would orphan them semantically; reject it.
create function public.assert_no_exercises_on_type_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type <> 'strength' and old.type = 'strength' then
    if tg_table_name = 'activities' and exists (
      select 1 from public.activity_exercises where activity_id = new.id
    ) then
      raise exception 'cannot change type of a strength activity that has exercises'
        using errcode = 'check_violation';
    elsif tg_table_name = 'workout_templates' and exists (
      select 1 from public.template_exercises where template_id = new.id
    ) then
      raise exception 'cannot change type of a strength template that has exercises'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger activities_type_change_guard
before update of type on public.activities
for each row execute function public.assert_no_exercises_on_type_change();

create trigger workout_templates_type_change_guard
before update of type on public.workout_templates
for each row execute function public.assert_no_exercises_on_type_change();

-- updated_at maintenance
create trigger exercises_set_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();
create trigger workout_templates_set_updated_at before update on public.workout_templates
  for each row execute function public.set_updated_at();
create trigger template_exercises_set_updated_at before update on public.template_exercises
  for each row execute function public.set_updated_at();
create trigger activities_set_updated_at before update on public.activities
  for each row execute function public.set_updated_at();
create trigger activity_exercises_set_updated_at before update on public.activity_exercises
  for each row execute function public.set_updated_at();
create trigger exercise_sets_set_updated_at before update on public.exercise_sets
  for each row execute function public.set_updated_at();
create trigger period_days_set_updated_at before update on public.period_days
  for each row execute function public.set_updated_at();
create trigger user_settings_set_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- Every new account gets a settings row with the defaults above, so the app
-- can always read settings without an existence check.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
