-- Grit Girl — M5 cycle tracking: onboarding fields + atomic period logging.
-- Technical design §5 (user_settings, period_days), §9, §10; PRD CYC-1/2/3, SET-1.

-- ───────────────────────── onboarding fields ─────────────────────────
-- A settings row is created for every new account by handle_new_user(), so
-- "has a settings row" cannot tell whether the user finished onboarding.
-- onboarded_at does: it is null until the onboarding form is submitted.
--
-- last_period_start is the onboarding "last period start" (CYC-3). The phase
-- engine only uses it while no period days are logged; once anything is
-- logged the logs are the source of truth.

alter table public.user_settings
  add column display_name      text        null,
  add column last_period_start date        null,
  add column onboarded_at      timestamptz null;

alter table public.user_settings
  add constraint user_settings_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 60);

-- The phase engine (lib/domain/cycle.ts) accepts a default period length of
-- 1–14 days; keep the database in step so a stored value can never make it throw.
alter table public.user_settings drop constraint user_settings_period_len;
alter table public.user_settings
  add constraint user_settings_period_len check (default_period_len between 1 and 14);

-- ───────────────────────── period logging ─────────────────────────
-- Replaces the caller's logged period days inside [p_from, p_to] with exactly
-- p_days (a JSON array of {"date": "YYYY-MM-DD", "flow": flow_level|null}):
--   * days in the range that are not in p_days are deleted (clear / shorten);
--   * days in p_days are inserted, or have their flow updated.
-- One call = one transaction, so editing a period (move start/end, change
-- flow) never leaves a half-applied state. An empty array clears the range.
--
-- security invoker: runs as the caller, so the period_days RLS policy applies
-- to every row touched, and rows are always written for auth.uid().

create function public.replace_period_days(p_from date, p_to date, p_days jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid range: from must be on or before to'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to - p_from > 366 then
    raise exception 'range too long (max 367 days)' using errcode = 'invalid_parameter_value';
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' then
    raise exception 'p_days must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_days) as d (date date, flow public.flow_level)
    where d.date is null or d.date < p_from or d.date > p_to
  ) then
    raise exception 'every day must be a date inside [p_from, p_to]'
      using errcode = 'invalid_parameter_value';
  end if;
  if (
    select count(*) <> count(distinct d.date)
    from jsonb_to_recordset(p_days) as d (date date, flow public.flow_level)
  ) then
    raise exception 'duplicate date in p_days' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.period_days pd
  where pd.user_id = uid
    and pd.date between p_from and p_to
    and not exists (
      select 1 from jsonb_to_recordset(p_days) as d (date date, flow public.flow_level)
      where d.date = pd.date
    );

  insert into public.period_days (user_id, date, flow)
  select uid, d.date, d.flow
  from jsonb_to_recordset(p_days) as d (date date, flow public.flow_level)
  on conflict (user_id, date) do update
    set flow = excluded.flow
    where public.period_days.flow is distinct from excluded.flow;
end;
$$;

revoke execute on function public.replace_period_days(date, date, jsonb) from public, anon;
grant execute on function public.replace_period_days(date, date, jsonb) to authenticated;
