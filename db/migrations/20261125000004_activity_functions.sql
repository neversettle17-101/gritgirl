-- Grit Girl — M2/M3: database functions behind the activities and exercises API.
-- Technical design §6 (one-transaction strength save), §4 (search), §10 (API).
--
-- The app calls these through supabase-js RPC with the signed-in user's JWT.
-- They are all SECURITY INVOKER, so every statement inside runs as the caller
-- and Row-Level Security applies exactly as for a direct query. A Postgres
-- function body runs in a single transaction, which is what makes a strength
-- workout (activity + exercises + sets) all-or-nothing.

-- ───────────────────────── save_activity ─────────────────────────
-- Creates (p_replace = false) or replaces (p_replace = true) one activity from
-- the API document:
--
--   { "id", "type", "date", "startTime"?, "durationSec"?, "notes"?, "feel"?,
--     "distanceM"?, "avgHeartRate"?, "templateId"?,
--     "exercises"?: [ { "exerciseId", "notes"?, "sets": [
--         { "reps"?, "durationSec"?, "weightKg"? } ] } ] }
--
-- Exercise positions and set numbers come from array order (1-based), so the
-- client can never produce gaps or duplicates. Replacing deletes the old child
-- rows and inserts the new ones in the same transaction. The API validates the
-- document with Zod first; the table constraints and RLS are the backstop.
--
-- Errors (SQLSTATE → API status):
--   P0002 activity not found (or not yours)   → 404
--   23503 exercise unknown / not visible to you → 422
--   23505 activity id already exists           → 409
--   23514 / 22xxx constraint or cast failures  → 422

create function public.save_activity(doc jsonb, p_replace boolean default false)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid := (doc ->> 'id')::uuid;
  v_type public.activity_type := (doc ->> 'type')::public.activity_type;
  v_ex   jsonb;
  v_pos  int;
  v_ae   uuid;
  v_exercise uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_id is null or v_type is null then
    raise exception 'id and type are required' using errcode = '22023';
  end if;

  if p_replace then
    -- Children first, so a strength → run edit passes the type-change guard.
    -- RLS limits both statements to the caller's own rows.
    delete from public.activity_exercises where activity_id = v_id;

    update public.activities set
      type           = v_type,
      date           = (doc ->> 'date')::date,
      start_time     = (doc ->> 'startTime')::time,
      duration_sec   = (doc ->> 'durationSec')::int,
      notes          = doc ->> 'notes',
      feel           = (doc ->> 'feel')::public.feel_level,
      distance_m     = (doc ->> 'distanceM')::int,
      avg_heart_rate = (doc ->> 'avgHeartRate')::smallint,
      template_id    = (doc ->> 'templateId')::uuid
    where id = v_id;

    if not found then
      raise exception 'activity % not found', v_id using errcode = 'P0002';
    end if;
  else
    insert into public.activities (
      id, user_id, type, date, start_time, duration_sec, notes, feel,
      distance_m, avg_heart_rate, template_id
    ) values (
      v_id, v_uid, v_type,
      (doc ->> 'date')::date,
      (doc ->> 'startTime')::time,
      (doc ->> 'durationSec')::int,
      doc ->> 'notes',
      (doc ->> 'feel')::public.feel_level,
      (doc ->> 'distanceM')::int,
      (doc ->> 'avgHeartRate')::smallint,
      (doc ->> 'templateId')::uuid
    );
  end if;

  if v_type = 'strength' then
    for v_ex, v_pos in
      select e.value, e.ordinality
      from jsonb_array_elements(coalesce(doc -> 'exercises', '[]'::jsonb)) with ordinality as e
    loop
      v_exercise := (v_ex ->> 'exerciseId')::uuid;
      -- RLS hides other users' custom exercises, so this also rejects them.
      if not exists (select 1 from public.exercises x where x.id = v_exercise) then
        raise exception 'exercise % not found', v_exercise using errcode = '23503';
      end if;

      insert into public.activity_exercises (activity_id, exercise_id, position, notes)
      values (v_id, v_exercise, v_pos, v_ex ->> 'notes')
      returning id into v_ae;

      insert into public.exercise_sets (activity_exercise_id, set_number, reps, duration_sec, weight_kg)
      select v_ae,
             s.ordinality,
             (s.value ->> 'reps')::smallint,
             (s.value ->> 'durationSec')::int,
             (s.value ->> 'weightKg')::numeric
      from jsonb_array_elements(coalesce(v_ex -> 'sets', '[]'::jsonb)) with ordinality as s;
    end loop;
  end if;

  return v_id;
end;
$$;

-- ───────────────────────── search_exercises ─────────────────────────
-- Library + the caller's custom exercises (RLS), typo-tolerant via pg_trgm:
-- a name matches if it contains the term or a word in it is similar enough
-- ("squt" → "Squat"). Ranked: exact, prefix, word similarity, then whole-name
-- similarity (shorter, closer names first); custom exercises first on ties. Filters: primary muscle and equipment.

create function public.search_exercises(
  q text default null,
  muscle text default null,
  equipment_filter text default null,
  max_rows int default 30
)
returns setof public.exercises
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (
    select
      nullif(btrim(coalesce(q, '')), '') as term,
      replace(replace(replace(btrim(coalesce(q, '')), '\', '\\'), '%', '\%'), '_', '\_') as pat
  )
  select e.*
  from public.exercises e, p
  where (search_exercises.muscle is null or search_exercises.muscle = any (e.primary_muscles))
    and (equipment_filter is null or e.equipment = equipment_filter)
    and (
      p.term is null
      or e.name ilike '%' || p.pat || '%'
      or extensions.word_similarity(p.term, e.name) >= 0.4
    )
  order by
    case
      when p.term is null then 0
      when lower(e.name) = lower(p.term) then 0
      when e.name ilike p.pat || '%' then 1
      else 2
    end,
    case when p.term is null then 0 else extensions.word_similarity(p.term, e.name) end desc,
    case when p.term is null then 0 else extensions.similarity(p.term, e.name) end desc,
    (e.owner_user_id is null),
    e.name
  limit greatest(1, least(coalesce(max_rows, 30), 100));
$$;

-- ───────────────────────── exercise_last_sets ─────────────────────────
-- The caller's most recent logged sets for one exercise (template pre-fill,
-- "last time" hint). Null when never logged.

create function public.exercise_last_sets(p_exercise_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'activityId', a.id,
    'date', a.date,
    'sets', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'setNumber', s.set_number,
          'reps', s.reps,
          'durationSec', s.duration_sec,
          'weightKg', s.weight_kg
        ) order by s.set_number)
      from public.exercise_sets s
      where s.activity_exercise_id = ae.id
    ), '[]'::jsonb)
  )
  from public.activity_exercises ae
  join public.activities a on a.id = ae.activity_id
  where ae.exercise_id = p_exercise_id
    and a.user_id = (select auth.uid())
  order by a.date desc, a.start_time desc nulls last, a.created_at desc, ae.position
  limit 1;
$$;

-- Signed-in users only.
revoke execute on function public.save_activity(jsonb, boolean) from public, anon;
revoke execute on function public.search_exercises(text, text, text, int) from public, anon;
revoke execute on function public.exercise_last_sets(uuid) from public, anon;
grant execute on function public.save_activity(jsonb, boolean) to authenticated;
grant execute on function public.search_exercises(text, text, text, int) to authenticated;
grant execute on function public.exercise_last_sets(uuid) to authenticated;
