import { z } from "zod";
import { BOARD_VIEWS } from "@/lib/domain/board";
import { isoDateSchema } from "./activities";

/** GET /api/board?view=day|week|month&date=YYYY-MM-DD (date defaults to today). */
export const boardQuerySchema = z.object({
  view: z.enum(BOARD_VIEWS, { message: "Use view=day, week or month" }).default("week"),
  date: isoDateSchema.optional(),
});

/** A ledger page's ?date=: a valid date, else today. */
export function pageDate(raw: string | string[] | undefined, today: string): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && isoDateSchema.safeParse(v).success ? v : today;
}
