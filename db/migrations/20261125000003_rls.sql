-- Grit Girl — M1 foundation, part 3: Row-Level Security (technical design §11).
--
--   * Every user table: a user sees and changes only rows where
--     user_id = auth.uid().
--   * Child tables (activity_exercises, exercise_sets, template_exercises)
--     check ownership through their parent.
--   * exercises: library rows (owner_user_id is null) are readable by every
--     signed-in user; custom rows only by their owner. Library rows are
--     written only by the seed script (service role / postgres, bypassing RLS).
--   * References are checked too: you cannot attach another user's custom
--     exercise or template to your own rows (FK checks bypass RLS, so this
--     must be in the policies).
--   * The anon role gets no access to app tables at all.
--
-- `(select auth.uid())` is evaluated once per statement instead of per row.

alter table public.exercises          enable row level security;
alter table public.workout_templates  enable row level security;
alter table public.template_exercises enable row level security;
alter table public.activities         enable row level security;
alter table public.activity_exercises enable row level security;
alter table public.exercise_sets      enable row level security;
alter table public.period_days        enable row level security;
alter table public.user_settings      enable row level security;

revoke all on
  public.exercises, public.workout_templates, public.template_exercises,
  public.activities, public.activity_exercises, public.exercise_sets,
  public.period_days, public.user_settings, public.workout_template_usage
from anon;

-- Usage counts are read-only.
revoke insert, update, delete, truncate on public.workout_template_usage from authenticated;

-- ───────── exercises ─────────

create policy exercises_select on public.exercises
  for select to authenticated
  using (owner_user_id is null or owner_user_id = (select auth.uid()));

create policy exercises_insert on public.exercises
  for insert to authenticated
  with check (owner_user_id = (select auth.uid()) and source = 'custom');

create policy exercises_update on public.exercises
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()) and source = 'custom');

create policy exercises_delete on public.exercises
  for delete to authenticated
  using (owner_user_id = (select auth.uid()));

-- ───────── workout_templates ─────────

create policy workout_templates_owner on public.workout_templates
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ───────── template_exercises (via parent template) ─────────

create policy template_exercises_owner on public.template_exercises
  for all to authenticated
  using (
    exists (
      select 1 from public.workout_templates t
      where t.id = template_exercises.template_id
        and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.workout_templates t
      where t.id = template_exercises.template_id
        and t.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.exercises e
      where e.id = template_exercises.exercise_id
        and (e.owner_user_id is null or e.owner_user_id = (select auth.uid()))
    )
  );

-- ───────── activities ─────────

create policy activities_owner on public.activities
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      template_id is null
      or exists (
        select 1 from public.workout_templates t
        where t.id = activities.template_id
          and t.user_id = (select auth.uid())
      )
    )
  );

-- ───────── activity_exercises (via parent activity) ─────────

create policy activity_exercises_owner on public.activity_exercises
  for all to authenticated
  using (
    exists (
      select 1 from public.activities a
      where a.id = activity_exercises.activity_id
        and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.activities a
      where a.id = activity_exercises.activity_id
        and a.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.exercises e
      where e.id = activity_exercises.exercise_id
        and (e.owner_user_id is null or e.owner_user_id = (select auth.uid()))
    )
  );

-- ───────── exercise_sets (via activity_exercises → activities) ─────────

create policy exercise_sets_owner on public.exercise_sets
  for all to authenticated
  using (
    exists (
      select 1
      from public.activity_exercises ae
      join public.activities a on a.id = ae.activity_id
      where ae.id = exercise_sets.activity_exercise_id
        and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.activity_exercises ae
      join public.activities a on a.id = ae.activity_id
      where ae.id = exercise_sets.activity_exercise_id
        and a.user_id = (select auth.uid())
    )
  );

-- ───────── period_days ─────────

create policy period_days_owner on public.period_days
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ───────── user_settings ─────────

create policy user_settings_owner on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
