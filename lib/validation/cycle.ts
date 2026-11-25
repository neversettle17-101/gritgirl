import { z } from "zod";
import { diffDays, isIsoDate, isValidTimeZone } from "@/lib/domain/dates";
import { MAX_CYCLE_LEN, MAX_PERIOD_LEN, MIN_CYCLE_LEN } from "@/lib/domain/cycle";

/**
 * Zod schemas shared by the cycle / settings API routes and their forms
 * (technical design §10). Dates are local calendar dates, `YYYY-MM-DD`.
 */

export const FLOW_LEVELS = ["spotting", "light", "medium", "heavy"] as const;

export const isoDate = z.string().refine(isIsoDate, { message: "Use a valid date (YYYY-MM-DD)" });
export const flowLevel = z.enum(FLOW_LEVELS);

/** Longest range GET /api/period-days and /api/cycle/calendar will return. */
export const MAX_READ_RANGE_DAYS = 731;
/** Longest range one PUT /api/period-days may touch (matches the SQL function). */
export const MAX_WRITE_RANGE_DAYS = 367;
/** "set" marks every day in the range, so it is limited to a plausible period. */
export const MAX_SET_RANGE_DAYS = 31;

const bothDates = (r: { from: unknown; to: unknown }) =>
  typeof r.from === "string" && typeof r.to === "string" && isIsoDate(r.from) && isIsoDate(r.to);

/** `?from=&to=` query for the read endpoints. */
export const dateRangeQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((r) => !bothDates(r) || r.from <= r.to, {
    message: "`from` must be on or before `to`",
    path: ["to"],
  })
  .refine((r) => !bothDates(r) || r.from > r.to || diffDays(r.from, r.to) < MAX_READ_RANGE_DAYS, {
    message: `Range can be at most ${MAX_READ_RANGE_DAYS} days`,
    path: ["to"],
  });
export type DateRangeQuery = z.infer<typeof dateRangeQuery>;

/**
 * PUT /api/period-days body.
 *   set     → every day in [from, to] becomes a period day. Flow per day comes
 *             from `flows[date]`, else `flow`, else null (unknown).
 *   clear   → every logged day in [from, to] is removed.
 *   replace → the logged days in [from, to] become exactly `days`
 *             (used to edit a period: move start/end, change flow).
 */
const setBody = z
  .object({
    action: z.literal("set"),
    from: isoDate,
    to: isoDate,
    flow: flowLevel.nullable().optional(),
    flows: z.record(isoDate, flowLevel.nullable()).optional(),
  })
  .strict();
const clearBody = z.object({ action: z.literal("clear"), from: isoDate, to: isoDate }).strict();
const replaceBody = z
  .object({
    action: z.literal("replace"),
    from: isoDate,
    to: isoDate,
    days: z
      .array(z.object({ date: isoDate, flow: flowLevel.nullable().optional() }).strict())
      .max(MAX_WRITE_RANGE_DAYS),
  })
  .strict();

export const periodDaysPutBody = z
  .discriminatedUnion("action", [setBody, clearBody, replaceBody])
  .superRefine((b, ctx) => {
    if (!bothDates(b)) return;
    if (b.from > b.to) {
      ctx.addIssue({ code: "custom", message: "`from` must be on or before `to`", path: ["to"] });
      return;
    }
    const len = diffDays(b.from, b.to) + 1;
    const max = b.action === "set" ? MAX_SET_RANGE_DAYS : MAX_WRITE_RANGE_DAYS;
    if (len > max) {
      ctx.addIssue({ code: "custom", message: `Range can be at most ${max} days`, path: ["to"] });
    }
    const inRange = (d: string) => d >= b.from && d <= b.to;
    if (b.action === "set" && b.flows) {
      for (const d of Object.keys(b.flows)) {
        if (!inRange(d)) {
          ctx.addIssue({ code: "custom", message: `${d} is outside the range`, path: ["flows", d] });
        }
      }
    }
    if (b.action === "replace") {
      const seen = new Set<string>();
      b.days.forEach((d, i) => {
        if (!inRange(d.date)) {
          ctx.addIssue({ code: "custom", message: `${d.date} is outside the range`, path: ["days", i, "date"] });
        }
        if (seen.has(d.date)) {
          ctx.addIssue({ code: "custom", message: `${d.date} is listed twice`, path: ["days", i, "date"] });
        }
        seen.add(d.date);
      });
    }
  });
export type PeriodDaysPutBody = z.infer<typeof periodDaysPutBody>;

/** Every field the user can change on PUT /api/settings (all optional). */
export const settingsFields = {
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a name")
    .max(60, "Keep it under 60 characters")
    .nullable(),
  weightUnit: z.enum(["kg", "lb"]),
  distanceUnit: z.enum(["km", "mi"]),
  /** 0 = Sunday … 6 = Saturday. */
  weekStartsOn: z.number().int().min(0).max(6),
  timezone: z.string().refine(isValidTimeZone, { message: "Unknown time zone" }),
  defaultCycleLen: z
    .number()
    .int()
    .min(MIN_CYCLE_LEN, `Cycle length is ${MIN_CYCLE_LEN}–${MAX_CYCLE_LEN} days`)
    .max(MAX_CYCLE_LEN, `Cycle length is ${MIN_CYCLE_LEN}–${MAX_CYCLE_LEN} days`),
  defaultPeriodLen: z
    .number()
    .int()
    .min(1, `Period length is 1–${MAX_PERIOD_LEN} days`)
    .max(MAX_PERIOD_LEN, `Period length is 1–${MAX_PERIOD_LEN} days`),
  cyclePredictionsOn: z.boolean(),
  lastPeriodStart: isoDate.nullable(),
};

export const settingsPutBody = z
  .object({
    ...Object.fromEntries(
      Object.entries(settingsFields).map(([k, v]) => [k, v.optional()]),
    ) as { [K in keyof typeof settingsFields]: z.ZodOptional<(typeof settingsFields)[K]> },
    /** Marks onboarding as done (sets onboarded_at once). */
    completeOnboarding: z.literal(true).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" });
export type SettingsPutBody = z.infer<typeof settingsPutBody>;

/** The onboarding form: name, units, cycle defaults, optional last period start. */
export const onboardingBody = z
  .object({
    displayName: settingsFields.displayName.unwrap(),
    weightUnit: settingsFields.weightUnit,
    distanceUnit: settingsFields.distanceUnit,
    timezone: settingsFields.timezone.optional(),
    lastPeriodStart: settingsFields.lastPeriodStart.optional(),
    defaultCycleLen: settingsFields.defaultCycleLen,
    defaultPeriodLen: settingsFields.defaultPeriodLen,
    cyclePredictionsOn: settingsFields.cyclePredictionsOn,
  })
  .strict();
export type OnboardingBody = z.infer<typeof onboardingBody>;

/** Flattens a ZodError into `{ "path.to.field": "message" }` for API errors and forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    out[key] ??= issue.message;
  }
  return out;
}
