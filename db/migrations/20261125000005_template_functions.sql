-- Grit Girl — M4: the database function behind the Regulars (templates) API.
-- Technical design §7 (templates) and §10 (API).
--
-- Like save_activity, this is SECURITY INVOKER: every statement runs as the
-- caller, so Row-Level Security applies exactly as for a direct query, and
-- the function body is one transaction, so a strength template and its
-- ordered exercises are saved all-or-nothing.

-- ───────────────────────── save_template ─────────────────────────
-- Creates (p_replace = false) or replaces (p_replace = true) one template from
-- the API document:
--
--   { "id", "type", "name", "notes"?,
--     "targetDistanceM"?, "targetDurationSec"?,           -- running / walking
--     "exercises"?: [ { "exerciseId", "targetSets",       -- strength
--         "targetReps"?, "targetDurationSec"?, "targetWeightKg"? } ] }
--
-- Exercise positions come from array order (1-based). Replacing deletes the
-- old template_exercises and inserts the new ones in the same transaction.
-- Archived templates cannot be replaced (they behave as deleted).
--
-- Errors (SQLSTATE → API status):
--   P0002 template not found, archived, or not yours → 404
--   23503 exercise unknown / not visible to you      → 422
--   23505 template id already exists                 → 409
--   23514 / 22xxx constraint or cast failures        → 422

create function public.save_template(doc jsonb, p_replace boolean default false)
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
  v_exercise uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_id is null or v_type is null then
    raise exception 'id and type are required' using errcode = '22023';
  end if;

  if p_replace then
    if not exists (
      select 1 from public.workout_templates where id = v_id and not archived
    ) then
      raise exception 'template % not found', v_id using errcode = 'P0002';
    end if;

    -- Children first, so a strength → run edit passes the type-change guard.
    delete from public.template_exercises where template_id = v_id;

    update public.workout_templates set
      type                = v_type,
      name                = btrim(doc ->> 'name'),
      notes               = doc ->> 'notes',
      target_distance_m   = (doc ->> 'targetDistanceM')::int,
      target_duration_sec = (doc ->> 'targetDurationSec')::int
    where id = v_id and not archived;
  else
    insert into public.workout_templates (
      id, user_id, type, name, notes, target_distance_m, target_duration_sec
    ) values (
      v_id, v_uid, v_type,
      btrim(doc ->> 'name'),
      doc ->> 'notes',
      (doc ->> 'targetDistanceM')::int,
      (doc ->> 'targetDurationSec')::int
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

      insert into public.template_exercises (
        template_id, exercise_id, position,
        target_sets, target_reps, target_duration_sec, target_weight_kg
      ) values (
        v_id, v_exercise, v_pos,
        coalesce((v_ex ->> 'targetSets')::smallint, 3),
        (v_ex ->> 'targetReps')::smallint,
        (v_ex ->> 'targetDurationSec')::int,
        (v_ex ->> 'targetWeightKg')::numeric
      );
    end loop;
  end if;

  return v_id;
end;
$$;

-- Signed-in users only.
revoke execute on function public.save_template(jsonb, boolean) from public, anon;
grant execute on function public.save_template(jsonb, boolean) to authenticated;
