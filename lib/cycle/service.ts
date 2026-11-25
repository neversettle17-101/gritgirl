/**
 * Cycle & settings use cases behind /api/period-days, /api/settings,
 * /api/cycle/* and the /cycle, /settings, /onboarding pages.
 *
 * Storage is behind `CycleRepo`, so this module is unit-tested with an
 * in-memory fake; the real implementation (./supabase-repo.ts) talks to
 * Supabase with the signed-in user's JWT, so RLS always applies.
 *
 * Phases and predictions come from the pure engine in lib/domain/cycle.ts
 * and are ESTIMATES, not medical advice.
 */
import {
  computeCycleCalendar,
  computeCycleSummary,
  type CycleSettings,
  type CycleSummary,
  type FlowLevel,
} from "@/lib/domain/cycle";
import {
  calendarToDays,
  groupPeriods,
  type CycleCalendarDay,
  type LoggedDay,
  type LoggedPeriod,
} from "@/lib/domain/cycle-view";
import { addDays, eachDay, isIsoDate, monthBounds, todayIn } from "@/lib/domain/dates";
import type {
  DateRangeQuery,
  OnboardingBody,
  PeriodDaysPutBody,
  SettingsPutBody,
} from "@/lib/validation/cycle";

export interface Settings {
  displayName: string | null;
  weightUnit: "kg" | "lb";
  distanceUnit: "km" | "mi";
  /** 0 = Sunday … 6 = Saturday */
  weekStartsOn: number;
  timezone: string;
  defaultCycleLen: number;
  defaultPeriodLen: number;
  cyclePredictionsOn: boolean;
  lastPeriodStart: string | null;
  /** True once the onboarding form has been submitted. */
  onboarded: boolean;
}

export type SettingsPatch = Partial<Omit<Settings, "onboarded">> & { onboardedAt?: string };

export interface CycleRepo {
  /** The caller's settings row, or null if it does not exist. */
  getSettings(): Promise<Settings | null>;
  /** Updates the caller's settings row; returns the new row, or null if missing. */
  updateSettings(patch: SettingsPatch): Promise<Settings | null>;
  /** Logged period days, ascending; all of them when no range is given. */
  listPeriodDays(range?: { from: string; to: string }): Promise<LoggedDay[]>;
  /** Atomically makes the logged days inside [from, to] exactly `days`. */
  replacePeriodDays(from: string, to: string, days: LoggedDay[]): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Periods can be logged up to one day ahead of the user's local today (time-zone slack). */
export const MAX_DAYS_AHEAD = 1;

export async function getSettings(repo: CycleRepo): Promise<Settings> {
  const s = await repo.getSettings();
  if (!s) throw new ApiError(404, "settings_not_found", "No settings found for this account");
  return s;
}

export async function updateSettings(
  repo: CycleRepo,
  body: SettingsPutBody,
  now: Date = new Date(),
): Promise<Settings> {
  const { completeOnboarding, ...fields } = body;
  const patch: SettingsPatch = { ...fields };
  if (completeOnboarding) {
    const current = await getSettings(repo);
    if (!current.onboarded) patch.onboardedAt = now.toISOString();
  }
  if (Object.keys(patch).length === 0) return getSettings(repo);
  const s = await repo.updateSettings(patch);
  if (!s) throw new ApiError(404, "settings_not_found", "No settings found for this account");
  return s;
}

export function completeOnboarding(
  repo: CycleRepo,
  body: OnboardingBody,
  now: Date = new Date(),
): Promise<Settings> {
  return updateSettings(
    repo,
    { ...body, lastPeriodStart: body.lastPeriodStart ?? null, completeOnboarding: true },
    now,
  );
}

/** The user's local "today", from their settings time zone. */
export function userToday(settings: Pick<Settings, "timezone">, now: Date = new Date()): string {
  try {
    return todayIn(settings.timezone, now);
  } catch {
    return todayIn("UTC", now);
  }
}

export function listPeriodDays(repo: CycleRepo, range: DateRangeQuery): Promise<LoggedDay[]> {
  return repo.listPeriodDays(range);
}

/** The exact set of days that should be logged in [from, to] after `body`. */
export function plannedDays(body: PeriodDaysPutBody): LoggedDay[] {
  switch (body.action) {
    case "clear":
      return [];
    case "replace":
      return body.days.map((d) => ({ date: d.date, flow: d.flow ?? null }));
    case "set":
      return eachDay(body.from, body.to).map((date) => ({
        date,
        flow: (body.flows?.[date] !== undefined ? body.flows[date] : body.flow) ?? null,
      }));
  }
}

export async function writePeriodDays(
  repo: CycleRepo,
  body: PeriodDaysPutBody,
  now: Date = new Date(),
): Promise<LoggedDay[]> {
  const days = plannedDays(body);
  if (days.length) {
    const latest = addDays(userToday(await getSettings(repo), now), MAX_DAYS_AHEAD);
    const future = days.find((d) => d.date > latest);
    if (future) {
      throw new ApiError(422, "future_date", "Period days can't be logged in the future", {
        [body.action === "replace" ? "days" : "to"]: `${future.date} is in the future`,
      });
    }
  }
  await repo.replacePeriodDays(body.from, body.to, days);
  return repo.listPeriodDays({ from: body.from, to: body.to });
}

function engineSettings(s: Settings): CycleSettings {
  return {
    defaultCycleLen: s.defaultCycleLen,
    defaultPeriodLen: s.defaultPeriodLen,
    predictionsOn: s.cyclePredictionsOn,
  };
}

export type CycleSummaryResponse = CycleSummary & { predictionsOn: boolean };

/** Engine summary for `today` from already-loaded settings and logs. */
export function summaryFrom(
  settings: Settings,
  days: readonly LoggedDay[],
  today: string,
): CycleSummaryResponse {
  const summary = computeCycleSummary(days, engineSettings(settings), today, {
    lastPeriodStart: settings.lastPeriodStart,
  });
  return { ...summary, predictionsOn: settings.cyclePredictionsOn };
}

/** Engine calendar for `range` from already-loaded settings and logs. */
export function calendarFrom(
  settings: Settings,
  days: readonly LoggedDay[],
  range: { from: string; to: string },
  today: string,
): CycleCalendarDay[] {
  return calendarToDays(
    computeCycleCalendar(days, engineSettings(settings), range, {
      lastPeriodStart: settings.lastPeriodStart,
      today,
    }),
  );
}

export async function getCycleSummary(
  repo: CycleRepo,
  opts: { today?: string; now?: Date } = {},
): Promise<CycleSummaryResponse> {
  const [settings, days] = await Promise.all([getSettings(repo), repo.listPeriodDays()]);
  return summaryFrom(settings, days, opts.today ?? userToday(settings, opts.now));
}

export async function getCycleCalendar(
  repo: CycleRepo,
  range: DateRangeQuery,
  opts: { now?: Date } = {},
): Promise<CycleCalendarDay[]> {
  const [settings, days] = await Promise.all([getSettings(repo), repo.listPeriodDays()]);
  return calendarFrom(settings, days, range, userToday(settings, opts.now));
}

/** Everything the /cycle screen shows, from one settings + logs load. */
export interface CycleView {
  today: string;
  /** First day of the month shown in the calendar (`YYYY-MM-01`). */
  month: string;
  summary: CycleSummaryResponse;
  /** Current cycle, start → expected end (or today, if later). Empty if unknown. */
  band: CycleCalendarDay[];
  /** Month grid days. */
  calendar: CycleCalendarDay[];
  /** Logged periods, newest first. */
  periods: LoggedPeriod[];
}

export function buildCycleView(
  settings: Settings,
  days: readonly LoggedDay[],
  today: string,
  month?: string | null,
): CycleView {
  const summary = summaryFrom(settings, days, today);
  let band: CycleCalendarDay[] = [];
  if (summary.currentCycleStart) {
    const expectedEnd = addDays(summary.currentCycleStart, summary.expectedCycleLen - 1);
    const to = expectedEnd > today ? expectedEnd : today;
    band = calendarFrom(settings, days, { from: summary.currentCycleStart, to }, today);
  }
  const bounds = monthBounds(month && isIsoDate(`${month}-01`) ? `${month}-01` : today);
  return {
    today,
    month: bounds.from,
    summary,
    band,
    calendar: calendarFrom(settings, days, bounds, today),
    periods: groupPeriods(days).reverse(),
  };
}

export type { FlowLevel };
