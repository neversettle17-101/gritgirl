"use client";

import { useMemo, useState, type FormEvent } from "react";
import { BloodDrop, PenCircle } from "@/components/cycle/marks";
import { TornEdge } from "@/components/ledger/ledger-shell";
import { Dashed, FieldError } from "@/components/ui";
import { ApiError, addPeriodDays, listPeriodDays, removePeriodDay, updateCycleMarkPrefs } from "@/lib/client/api";
import type { CycleMarkPrefs } from "@/lib/cycle/repo";
import { startOfWeek, type WeekStart } from "@/lib/domain/board";
import { currentPeriodDays, diffMarks, retypeDay, stripMonthLabel, weekDates } from "@/lib/domain/cycle-desk";
import { addDays, isIsoDate, monthLong, weekdayShort } from "@/lib/domain/dates";
import { PROFILE_LIMITS } from "@/lib/domain/profile";
import { PERIOD_LIMITS } from "@/lib/validation/cycle";

/**
 * Profile → Cycle desk (docs/design/cycle/CycProfile.dc.html): tap period
 * days on a week strip or type DAY 1 / DAY 2, pick where they get circled,
 * then STAMP IT. Nothing is saved until STAMP IT.
 */

const SWITCHES: { key: keyof CycleMarkPrefs; label: string }[] = [
  { key: "circleLedgers", label: "CIRCLE IT ON MY LEDGERS" },
  { key: "circleProgress", label: "CIRCLE IT ON PROGRESS CHARTS" },
];

/** How much further back to read when the strip moves past what's loaded (covers DAY N numbering too). */
const FETCH_BACK_DAYS = 56;

type Slot = "day1" | "day2";

export function CycleDesk({
  initialDates,
  loadedFrom: initialLoadedFrom,
  prefs: initialPrefs,
  today,
  weekStartsOn,
}: {
  /** Logged period days in [loadedFrom, today]. */
  initialDates: string[];
  loadedFrom: string;
  prefs: CycleMarkPrefs;
  today: string;
  weekStartsOn: WeekStart;
}) {
  const thisWeek = startOfWeek(today, weekStartsOn);
  const [saved, setSaved] = useState(() => new Set(initialDates));
  const [marked, setMarked] = useState(() => new Set(initialDates));
  const [loadedFrom, setLoadedFrom] = useState(initialLoadedFrom);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [savedPrefs, setSavedPrefs] = useState(initialPrefs);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [typed, setTyped] = useState<Partial<Record<Slot, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<Slot, string>>>({});
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const days = weekDates(weekStart);
  const [day1, day2] = useMemo(() => currentPeriodDays(marked), [marked]);
  const current: Record<Slot, string | null> = { day1, day2 };
  const count = days.filter((d) => marked.has(d)).length;

  /** Reads the logged days in [from, loadedFrom) so the strip shows the truth. */
  async function ensureLoaded(from: string): Promise<boolean> {
    if (from >= loadedFrom) return true;
    const ranges: { from: string; to: string }[] = [];
    for (let to = addDays(loadedFrom, -1); to >= from; to = addDays(to, -PERIOD_LIMITS.readRangeDays)) {
      const start = addDays(to, -(PERIOD_LIMITS.readRangeDays - 1));
      ranges.push({ from: start < from ? from : start, to });
    }
    try {
      const found = (await Promise.all(ranges.map(listPeriodDays))).flat();
      setSaved((s) => new Set([...s, ...found]));
      setMarked((m) => new Set([...m, ...found]));
      setLoadedFrom(from);
      return true;
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Couldn't load that week. Try again." });
      return false;
    }
  }

  async function goToWeek(start: string) {
    const next = start > thisWeek ? thisWeek : start;
    if (await ensureLoaded(addDays(next, -FETCH_BACK_DAYS))) setWeekStart(next);
  }

  function toggle(date: string) {
    if (date > today) return;
    setStatus(null);
    setMarked((m) => {
      const out = new Set(m);
      if (out.has(date)) out.delete(date);
      else out.add(date);
      return out;
    });
  }

  /** Applies a typed DAY 1 / DAY 2; returns the new marked set, or null if it's not a usable date. */
  function commitTyped(slot: Slot, base: Set<string>): Set<string> | null {
    const value = typed[slot];
    if (value === undefined) return base;
    if (value !== "" && (!isIsoDate(value) || value < PROFILE_LIMITS.dobMin)) {
      setErrors((e) => ({ ...e, [slot]: "Use a date like 2026-11-24" }));
      return null;
    }
    if (value > today) {
      setErrors((e) => ({ ...e, [slot]: "That day hasn't happened yet" }));
      return null;
    }
    setErrors((e) => ({ ...e, [slot]: undefined }));
    setTyped((t) => ({ ...t, [slot]: undefined }));
    return retypeDay(base, current[slot], value, today);
  }

  function blurSlot(slot: Slot) {
    const next = commitTyped(slot, marked);
    if (!next || next === marked) return;
    setMarked(next);
    const value = typed[slot];
    if (value) void goToWeek(startOfWeek(value, weekStartsOn));
  }

  async function stamp(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    let edited: Set<string> | null = marked;
    for (const slot of ["day1", "day2"] as const) {
      edited = edited && commitTyped(slot, edited);
    }
    if (!edited) return;
    setMarked(edited);

    const { add, remove } = diffMarks(saved, edited);
    const prefsPatch: Partial<CycleMarkPrefs> = {};
    for (const { key } of SWITCHES) if (prefs[key] !== savedPrefs[key]) prefsPatch[key] = prefs[key];
    if (!add.length && !remove.length && !Object.keys(prefsPatch).length) {
      setStatus({ kind: "ok", text: "NOTHING NEW TO STAMP" });
      return;
    }

    setBusy(true);
    try {
      // Record each part as it lands, so a retry after a failure only resends what's left.
      for (let i = 0; i < add.length; i += PERIOD_LIMITS.addDays) {
        const chunk = await addPeriodDays(add.slice(i, i + PERIOD_LIMITS.addDays));
        setSaved((s) => new Set([...s, ...chunk]));
      }
      await Promise.all(
        remove.map(async (d) => {
          await removePeriodDay(d);
          setSaved((s) => {
            const out = new Set(s);
            out.delete(d);
            return out;
          });
        }),
      );
      if (Object.keys(prefsPatch).length) setSavedPrefs(await updateCycleMarkPrefs(prefsPatch));
      setStatus({ kind: "ok", text: "STAMPED. THE BLOOD BANK IS UP TO DATE." });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const dateField = (slot: Slot, label: string) => (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={`cycle-${slot}`} className="font-extrabold text-muted">
        {label}
      </label>
      <input
        id={`cycle-${slot}`}
        type="date"
        min={PROFILE_LIMITS.dobMin}
        max={today}
        value={typed[slot] ?? current[slot] ?? ""}
        onChange={(e) => setTyped((t) => ({ ...t, [slot]: e.target.value }))}
        onBlur={() => blurSlot(slot)}
        aria-invalid={errors[slot] ? true : undefined}
        aria-describedby={errors[slot] ? `err-cycle-${slot}` : undefined}
        className="h-11 w-full min-w-0 border-2 border-blood bg-white px-2.5 font-mono text-sm font-extrabold text-ink outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-1"
      />
      <FieldError id={`err-cycle-${slot}`} message={errors[slot]} />
    </div>
  );

  return (
    <form onSubmit={stamp} noValidate aria-labelledby="cycle-heading">
      <div className="rotate-[0.6deg]">
        <div className="bg-paper px-3.5 pt-4 pb-3.5 text-xs text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
          <div className="flex items-center gap-2.5">
            <BloodDrop width={34} face />
            <div>
              <h2 id="cycle-heading" className="font-display text-[22px] leading-none font-extrabold">
                Cycle desk
              </h2>
              <p className="text-[11px] text-muted">log the blood bank&apos;s opening days</p>
            </div>
          </div>
          <Dashed className="mt-3 mb-2" />

          <p id="cycle-strip-label" className="font-extrabold text-muted">
            TAP YOUR PERIOD DAYS · {stripMonthLabel(weekStart)}
          </p>
          <div role="group" aria-labelledby="cycle-strip-label" className="mt-2 grid grid-cols-7 gap-1">
            {days.map((d) => {
              const on = marked.has(d);
              const n = Number(d.slice(8));
              const future = d > today;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggle(d)}
                  disabled={future || busy}
                  aria-pressed={on}
                  aria-label={`${weekdayShort(d)} ${n} ${monthLong(d)}${on ? ", period day" : ""}`}
                  className="relative flex h-[62px] min-w-0 flex-col items-center gap-0.5 border-2 border-ink bg-white pt-1 text-ink focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-[10px] text-muted">{weekdayShort(d)}</span>
                  <span className="text-sm font-extrabold">{n}</span>
                  {on ? (
                    <>
                      <BloodDrop width={14} />
                      <PenCircle bleed={6} strokeWidth={2.6} />
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="flex">
              <button
                type="button"
                onClick={() => goToWeek(addDays(weekStart, -7))}
                disabled={busy}
                className="h-11 pr-2 text-left focus-visible:ring-2 focus-visible:ring-blue disabled:opacity-40"
              >
                ‹ EARLIER WEEK
              </button>
              {weekStart < thisWeek ? (
                <button
                  type="button"
                  onClick={() => goToWeek(addDays(weekStart, 7))}
                  disabled={busy}
                  className="h-11 px-2 text-left focus-visible:ring-2 focus-visible:ring-blue disabled:opacity-40"
                >
                  LATER WEEK ›
                </button>
              ) : null}
            </span>
            <span data-testid="cycle-count">
              {count} {count === 1 ? "DAY" : "DAYS"} MARKED
            </span>
          </div>

          <Dashed className="mt-1 mb-2" />
          <div className="grid grid-cols-2 gap-2.5">
            {dateField("day1", "DAY 1")}
            {dateField("day2", "DAY 2")}
          </div>

          <Dashed className="mt-3 mb-1.5" />
          {SWITCHES.map(({ key, label }) => (
            <label key={key} className="flex h-11 cursor-pointer items-center gap-2.5 text-xs font-extrabold">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={prefs[key]}
                onChange={(e) => {
                  setStatus(null);
                  setPrefs((p) => ({ ...p, [key]: e.target.checked }));
                }}
              />
              <span
                aria-hidden="true"
                className="flex size-4 flex-none items-center justify-center border-2 border-ink text-xs leading-none peer-focus-visible:ring-2 peer-focus-visible:ring-blue peer-focus-visible:ring-offset-1"
              >
                {prefs[key] ? "X" : ""}
              </span>
              {label}
            </label>
          ))}
          <p className="mt-2 bg-blood-tint px-2.5 py-2 text-[11px] leading-[1.5] text-blood-ink">
            ONLY YOU SEE THIS. THE BLOOD BANK IS PRIVATE.
          </p>
        </div>
        <TornEdge />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-4 flex h-[58px] w-full items-center justify-center rounded-[14px] bg-blood text-[15px] font-extrabold tracking-[0.04em] text-white disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue"
      >
        {busy ? "STAMPING…" : "STAMP IT"}
      </button>
      <p role="status" className="mt-2 min-h-4 text-[11px] font-extrabold text-white">
        {status?.text ?? ""}
      </p>
    </form>
  );
}
