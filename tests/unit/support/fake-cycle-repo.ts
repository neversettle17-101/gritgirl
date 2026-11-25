import type { LoggedDay } from "@/lib/domain/cycle-view";
import type { CycleRepo, Settings } from "@/lib/cycle/service";

export const DEFAULT_SETTINGS: Settings = {
  displayName: null,
  weightUnit: "kg",
  distanceUnit: "km",
  weekStartsOn: 1,
  timezone: "Asia/Kolkata",
  defaultCycleLen: 28,
  defaultPeriodLen: 5,
  cyclePredictionsOn: true,
  lastPeriodStart: null,
  onboarded: false,
};

/** In-memory CycleRepo with the same semantics as the Supabase one. */
export function fakeCycleRepo(init: { settings?: Partial<Settings> | null; days?: LoggedDay[] } = {}) {
  let settings: Settings | null =
    init.settings === null ? null : { ...DEFAULT_SETTINGS, ...init.settings };
  let onboardedAt: string | null = settings?.onboarded ? "2026-01-01T00:00:00.000Z" : null;
  const days = new Map((init.days ?? []).map((d) => [d.date, d.flow]));
  const calls = { replace: [] as { from: string; to: string; days: LoggedDay[] }[], updates: [] as object[] };

  const repo: CycleRepo = {
    async getSettings() {
      return settings ? { ...settings } : null;
    },
    async updateSettings(patch) {
      calls.updates.push(patch);
      if (!settings) return null;
      const { onboardedAt: at, ...rest } = patch;
      if (at) onboardedAt = at;
      settings = { ...settings, ...rest, onboarded: onboardedAt !== null };
      return { ...settings };
    },
    async listPeriodDays(range) {
      return [...days]
        .filter(([d]) => !range || (d >= range.from && d <= range.to))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, flow]) => ({ date, flow }));
    },
    async replacePeriodDays(from, to, list) {
      calls.replace.push({ from, to, days: list });
      for (const d of [...days.keys()]) if (d >= from && d <= to) days.delete(d);
      for (const d of list) days.set(d.date, d.flow);
    },
  };
  return { repo, calls, onboardedAt: () => onboardedAt };
}
