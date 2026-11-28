import { z } from "zod";
import { daysBetween, isIsoDate } from "@/lib/domain/dates";
import { PROFILE_LIMITS } from "@/lib/domain/profile";
import { fieldErrors, isoDateSchema } from "./activities";

/**
 * Cycle desk API input (Profile → Cycle desk): logged period days and the
 * two "circle it" switches. Dates are the user's local calendar dates.
 */

export const PERIOD_LIMITS = {
  /** Longest range one GET /api/period-days may read. */
  readRangeDays: 366,
  /** Most days one POST /api/period-days may add (a long period, typed in at once). */
  addDays: 31,
} as const;

/** GET /api/period-days?from=&to= */
export const periodRangeQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .strict()
  .superRefine((r, ctx) => {
    if (!isIsoDate(r.from) || !isIsoDate(r.to)) return;
    if (r.from > r.to) ctx.addIssue({ code: "custom", message: "`from` must be on or before `to`", path: ["to"] });
    else if (daysBetween(r.from, r.to) >= PERIOD_LIMITS.readRangeDays) {
      ctx.addIssue({ code: "custom", message: `Ask for at most ${PERIOD_LIMITS.readRangeDays} days`, path: ["to"] });
    }
  });

/** POST /api/period-days { dates } — mark these days. */
export const periodDaysAddSchema = z
  .object({
    dates: z
      .array(isoDateSchema, { message: "Send a list of dates" })
      .min(1, "Pick at least one day")
      .max(PERIOD_LIMITS.addDays, `Mark at most ${PERIOD_LIMITS.addDays} days at once`),
  })
  .strict();

export type PeriodDaysAdd = z.input<typeof periodDaysAddSchema>;

/** PATCH /api/cycle/prefs — either switch. */
export const cycleMarkPrefsPatchSchema = z
  .object({
    circleLedgers: z.boolean({ message: "Use true or false" }),
    circleProgress: z.boolean({ message: "Use true or false" }),
  })
  .partial()
  .strict();

export type CycleMarkPrefsPatch = z.infer<typeof cycleMarkPrefsPatchSchema>;

type Checked<T> = { ok: true; data: T } | { ok: false; fields: Record<string, string> };

/** The days to mark, de-duplicated and sorted; none in the future (user's "today") or before 1900. */
export function checkPeriodDaysAdd(body: unknown, today: string): Checked<string[]> {
  const parsed = periodDaysAddSchema.safeParse(body);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const dates = [...new Set(parsed.data.dates)].sort();
  if (dates.some((d) => d > today)) return { ok: false, fields: { dates: "That day hasn't happened yet" } };
  if (dates.some((d) => d < PROFILE_LIMITS.dobMin)) return { ok: false, fields: { dates: "Use a date after 1900" } };
  return { ok: true, data: dates };
}

export function checkPeriodRange(query: unknown): Checked<{ from: string; to: string }> {
  const parsed = periodRangeQuerySchema.safeParse(query);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  return { ok: true, data: parsed.data };
}
