"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PrimaryButton, TextField } from "@/components/cycle/controls";
import { Rule } from "@/components/cycle/slip";
import { putJson } from "@/lib/cycle/client-api";
import type { FlowLevel } from "@/lib/domain/cycle";
import { FLOW_LABEL, type LoggedPeriod } from "@/lib/domain/cycle-view";
import { addDays, diffDays, eachDay, isIsoDate, shortDate } from "@/lib/domain/dates";
import { FLOW_LEVELS } from "@/lib/validation/cycle";

/** Longest period the sheet will log in one go. */
const MAX_SHEET_DAYS = 14;

/**
 * Bottom sheet to log a new period or edit / clear an existing one
 * (PRD CYC-1, CYC-2, CYC-8). Saves with one atomic PUT /api/period-days
 * `replace`, covering the old and new span so moving the start or end
 * removes the days that fell out.
 */
export function LogPeriodSheet({
  editing,
  today,
  defaultPeriodLen,
  onClose,
  onSaved,
}: {
  editing: LoggedPeriod | null;
  today: string;
  defaultPeriodLen: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const latest = addDays(today, 1);
  const [start, setStart] = useState(editing?.start ?? today);
  const [end, setEnd] = useState(editing?.end ?? today);
  const [flows, setFlows] = useState<Record<string, FlowLevel | null>>(() =>
    Object.fromEntries((editing?.days ?? []).map((d) => [d.date, d.flow])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const valid = isIsoDate(start) && isIsoDate(end);
  const problem = !valid
    ? "Pick a start and end date."
    : end < start
      ? "The end can't be before the start."
      : end > latest
        ? "The end can't be in the future."
        : diffDays(start, end) + 1 > MAX_SHEET_DAYS
          ? `That's longer than ${MAX_SHEET_DAYS} days. Check the dates?`
          : null;
  const days = valid && !problem ? eachDay(start, end) : [];

  function save(clear = false) {
    if (!clear && problem) {
      setError(problem);
      return;
    }
    // Cover both the old and the new span, so days that fell out are removed.
    const from = clear ? editing!.start : editing && editing.start < start ? editing.start : start;
    const to = clear ? editing!.end : editing && editing.end > end ? editing.end : end;
    setError(null);
    startTransition(async () => {
      const res = await putJson("/api/period-days", {
        action: "replace",
        from,
        to,
        days: clear ? [] : days.map((date) => ({ date, flow: flows[date] ?? null })),
      });
      if (!res.ok) {
        setError(res.error.fields ? Object.values(res.error.fields)[0]! : res.error.message);
        return;
      }
      onSaved();
    });
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="log-period-title"
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-ink/50 md:m-auto md:max-w-md"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="receipt max-h-[85dvh] overflow-y-auto p-5 text-xs md:max-h-[90dvh]"
      >
        <div className="flex items-center justify-between">
          <h2 id="log-period-title" className="font-display text-2xl font-extrabold">
            {editing ? "Edit period" : "Log a period"}
          </h2>
          <button type="button" onClick={() => ref.current?.close()} className="min-h-11 px-2 font-extrabold underline" aria-label="Close">
            CLOSE
          </button>
        </div>
        <Rule />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="lp-start"
            label="STARTED"
            type="date"
            max={latest}
            value={start}
            onChange={(e) => {
              const v = e.target.value;
              setStart(v);
              // New periods: suggest a typical length, capped at tomorrow.
              if (!editing && isIsoDate(v)) {
                const suggested = addDays(v, defaultPeriodLen - 1);
                setEnd(suggested < today ? suggested : v > today ? v : today);
              }
            }}
            required
          />
          <TextField id="lp-end" label="ENDED (OR TODAY)" type="date" min={start} max={latest} value={end} onChange={(e) => setEnd(e.target.value)} required />
        </div>

        <Rule />
        <p className="text-[11px] font-extrabold tracking-[0.04em] text-muted">FLOW PER DAY (OPTIONAL)</p>
        {days.length === 0 ? (
          <p className="mt-2 text-muted">{problem ?? ""}</p>
        ) : (
          <ul className="mt-1">
            {days.map((date, i) => (
              <li key={date} className="flex items-center justify-between gap-2 border-b border-dashed border-rule py-1 last:border-b-0">
                <span className="w-20 shrink-0 font-extrabold">
                  {shortDate(date)}
                  <span className="block text-[10px] font-semibold text-muted">DAY {i + 1}</span>
                </span>
                <div role="radiogroup" aria-label={`Flow on ${shortDate(date)}`} className="flex flex-1 justify-end">
                  {[null, ...FLOW_LEVELS].map((f) => {
                    const checked = (flows[date] ?? null) === f;
                    return (
                      <label
                        key={f ?? "none"}
                        className={`-ml-0.5 flex h-11 min-w-10 cursor-pointer items-center justify-center border-2 border-ink px-1 text-[11px] font-extrabold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue ${
                          checked ? "bg-ink text-paper" : "bg-white"
                        }`}
                        title={f ? FLOW_LABEL[f] : "Not recorded"}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={`flow-${date}`}
                          checked={checked}
                          onChange={() => setFlows((s) => ({ ...s, [date]: f }))}
                          aria-label={f ? FLOW_LABEL[f] : "Not recorded"}
                        />
                        <span aria-hidden="true">{f ? f[0]!.toUpperCase() : "—"}</span>
                      </label>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}

        {error || (problem && valid) ? (
          <p role="alert" className="mt-3 border-2 border-red px-3 py-2 font-extrabold text-red">
            {error ?? problem}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <PrimaryButton type="submit" pending={pending || Boolean(problem)}>
            {pending ? "SAVING…" : editing ? "SAVE CHANGES" : "SAVE PERIOD"}
          </PrimaryButton>
          {editing ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Clear the period from ${shortDate(editing.start)}?`)) save(true);
              }}
              disabled={pending}
              className="min-h-11 font-extrabold text-red underline underline-offset-2"
            >
              CLEAR THIS PERIOD
            </button>
          ) : null}
        </div>
      </form>
    </dialog>
  );
}
