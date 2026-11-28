-- Grit Girl — cycle desk preferences (Profile → Cycle desk).
--
-- Two switches decide where logged period days get the red "blood bank down"
-- circle: the Week / Month ledgers, and the per-exercise progress charts.
-- Period days themselves live in public.period_days (already RLS-owned).

alter table public.user_settings
  add column cycle_circle_ledgers  boolean not null default true,
  add column cycle_circle_progress boolean not null default true;
