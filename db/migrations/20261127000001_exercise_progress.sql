-- Grit Girl — per-exercise progress (Progress overview + /progress/:exerciseId).
--
-- Returns the caller's logged strength history, one row per exercise, with
-- every session of that exercise as JSON (oldest first):
--
--   sessions: [ { "activityId", "date", "sets": [
--       { "reps", "durationSec", "weightKg" } ] } ]
--
-- One row per exercise (not per set) keeps the result far below PostgREST's
-- max_rows, however long the history. The app does the week bucketing, the
-- unit conversion and the maths (lib/domain/progress.ts), so the week start
-- and time zone come from user_settings in exactly one place.
--
-- SECURITY INVOKER: RLS applies as for a direct query, and the explicit
-- auth.uid() filter makes "only my own workouts" obvious and index-friendly.
-- p_exercise_id = null returns every exercise I have logged.

create function public.exercise_progress(p_exercise_id uuid default null)
returns table (
  exercise_id uuid,
  name        text,
  tracking    public.exercise_track,
  sessions    jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select ae.id as ae_id, ae.position, ae.exercise_id, a.id as activity_id, a.date, a.start_time, a.created_at
    from public.activity_exercises ae
    join public.activities a on a.id = ae.activity_id
    where a.user_id = (select auth.uid())
      and a.type = 'strength'
      and (p_exercise_id is null or ae.exercise_id = p_exercise_id)
  ),
  per_session as (
    -- An exercise listed twice in one workout counts as one session.
    select
      m.exercise_id,
      m.activity_id,
      m.date,
      min(m.start_time) as start_time,
      min(m.created_at) as created_at,
      coalesce(
        jsonb_agg(
          jsonb_build_object('reps', s.reps, 'durationSec', s.duration_sec, 'weightKg', s.weight_kg)
          order by m.position, s.set_number
        ) filter (where s.id is not null),
        '[]'::jsonb
      ) as sets
    from mine m
    left join public.exercise_sets s on s.activity_exercise_id = m.ae_id
    group by m.exercise_id, m.activity_id, m.date
  )
  select
    e.id,
    e.name,
    e.tracking,
    jsonb_agg(
      jsonb_build_object('activityId', p.activity_id, 'date', p.date, 'sets', p.sets)
      order by p.date, p.start_time nulls last, p.created_at
    )
  from per_session p
  join public.exercises e on e.id = p.exercise_id
  group by e.id, e.name, e.tracking
  order by max(p.date) desc, e.name;
$$;

-- Signed-in users only.
revoke execute on function public.exercise_progress(uuid) from public, anon;
grant execute on function public.exercise_progress(uuid) to authenticated;
