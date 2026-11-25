"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PhaseBand, PhaseLegend } from "@/components/cycle/phase-band";
import { phaseCellStyle, PHASE_COLOR } from "@/components/cycle/phase-style";
import { DISCLAIMER, Line, Rule, Slip } from "@/components/cycle/slip";
import { PrimaryButton } from "@/components/cycle/controls";
import { putJson } from "@/lib/cycle/client-api";
import type { CycleView } from "@/lib/cycle/service";
import { FLOW_LABEL, PHASE_CODE, PHASE_LABEL, type CycleCalendarDay, type LoggedPeriod } from "@/lib/domain/cycle-view";
import { addDays, diffDays, monthLabel, shortDate, weekday, weekdayShort } from "@/lib/domain/dates";
import { LogPeriodSheet } from "./log-period-sheet";

const FLOW_CODE = { spotting: "S", light: "L", medium: "M", heavy: "H" } as const;

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function SummarySlip({ view, onLog }: { view: CycleView; onLog: () => void }) {
  const s = view.summary;
  const noData = s.currentCycleStart === null;
  return (
    <Slip tilt={-0.6} torn aria-label="Current cycle" data-testid="cycle-summary">
      <div className="flex justify-between text-[11px] font-extrabold tracking-[0.1em] text-muted">
        <span>TODAY · {shortDate(view.today)}</span>
        <span>{s.predictionsOn ? "ESTIMATE" : "PERIODS ONLY"}</span>
      </div>

      {noData ? (
        <div className="mt-3">
          <p className="font-display text-2xl leading-tight font-extrabold">Nothing on the slip yet.</p>
          <p className="mt-2 leading-relaxed">
            Log your last period and we&apos;ll work out your cycle day
            {s.predictionsOn ? ", phase and next period" : ""}.
          </p>
          <button type="button" onClick={onLog} className="mt-3 min-h-11 font-extrabold underline underline-offset-4">
            LOG A PERIOD →
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2" data-testid="cycle-day">
            <span className="font-display text-[50px] leading-none font-extrabold">DAY {s.cycleDay}</span>
            {s.predictionsOn ? <span className="text-sm font-extrabold">OF ~{s.expectedCycleLen}</span> : null}
          </div>
          {s.phase ? (
            <p className="mt-1 flex items-center gap-2 text-sm font-extrabold" data-testid="cycle-phase">
              <span
                aria-hidden="true"
                className="inline-flex size-5 items-center justify-center text-[10px]"
                style={{ background: PHASE_COLOR[s.phase].bg, color: PHASE_COLOR[s.phase].fg }}
              >
                {PHASE_CODE[s.phase]}
              </span>
              {PHASE_LABEL[s.phase].toUpperCase()} PHASE <span className="font-semibold text-muted">(EST.)</span>
            </p>
          ) : null}

          {view.band.length ? (
            <div className="mt-3">
              <PhaseBand
                days={view.band}
                today={view.today}
                label={`Current cycle from ${shortDate(view.band[0]!.date)}, phases are estimates`}
              />
              <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted">
                <span>{shortDate(view.band[0]!.date)}</span>
                <span>{shortDate(view.band[view.band.length - 1]!.date)}</span>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Rule />
      <div className="flex flex-col gap-0.5 leading-[1.7]">
        {s.predictionsOn && s.nextPeriodStart ? (
          <Line
            strong
            label="NEXT PERIOD (PREDICTED)"
            value={
              <span data-testid="next-period">
                ~{shortDate(s.nextPeriodStart)}
                <span className="block text-[11px] font-semibold">
                  {s.isLate
                    ? s.daysUntilNextPeriod === 0
                      ? "EXPECTED TODAY"
                      : `EXPECTED ${-s.daysUntilNextPeriod!} DAY${s.daysUntilNextPeriod === -1 ? "" : "S"} AGO`
                    : `IN ${s.daysUntilNextPeriod} DAY${s.daysUntilNextPeriod === 1 ? "" : "S"}`}
                </span>
              </span>
            }
          />
        ) : null}
        <Line
          label="AVG CYCLE"
          value={`${round1(s.avgCycleLen)} DAYS${s.cycleLenIsDefault ? " · TYPICAL" : ""}`}
        />
        <Line
          label="AVG PERIOD"
          value={`${round1(s.avgPeriodLen)} DAYS${s.periodLenIsDefault ? " · TYPICAL" : ""}`}
        />
        {s.lastCycleLen !== null ? <Line label="LAST CYCLE" value={`${s.lastCycleLen} DAYS`} /> : null}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted">{DISCLAIMER}</p>
    </Slip>
  );
}

function MonthSlip({
  view,
  weekStartsOn,
  onToggle,
  pendingDate,
}: {
  view: CycleView;
  weekStartsOn: number;
  onToggle: (d: CycleCalendarDay) => void;
  pendingDate: string | null;
}) {
  const first = view.calendar[0]!;
  const lead = (weekday(first.date) - weekStartsOn + 7) % 7;
  const prev = addDays(view.month, -1).slice(0, 7);
  const next = addDays(view.calendar[view.calendar.length - 1]!.date, 1).slice(0, 7);
  const headers = Array.from({ length: 7 }, (_, i) => weekdayShort((weekStartsOn + i) % 7)[0]);
  const latest = addDays(view.today, 1);

  return (
    <Slip tilt={0.6} torn aria-label={`Period calendar, ${monthLabel(view.month)}`}>
      <div className="flex items-center justify-between">
        <Link href={`/cycle?month=${prev}`} scroll={false} aria-label="Previous month" className="flex size-11 items-center justify-center text-base font-extrabold">
          ←
        </Link>
        <span className="text-sm font-extrabold tracking-[0.06em]" data-testid="calendar-month">
          {monthLabel(view.month)}
        </span>
        <Link href={`/cycle?month=${next}`} scroll={false} aria-label="Next month" className="flex size-11 items-center justify-center text-base font-extrabold">
          →
        </Link>
      </div>
      <div className="mb-1.5 grid grid-cols-7 gap-[3px] border-b-2 border-dashed border-ink pb-1.5 text-center text-[11px] font-extrabold" aria-hidden="true">
        {headers.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[3px]" role="group" aria-label="Tap a day to mark or unmark it as a period day">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`blank-${i}`} className="h-12" />
        ))}
        {view.calendar.map((d) => {
          const isToday = d.date === view.today;
          const future = d.date > latest;
          const n = Number(d.date.slice(8));
          const label = [
            `${shortDate(d.date)}`,
            d.isPeriod ? `period logged${d.flow ? `, ${FLOW_LABEL[d.flow].toLowerCase()} flow` : ""}` : "no period logged",
            d.phase ? `${PHASE_LABEL[d.phase]} phase (estimate${d.predicted ? ", predicted" : ""})` : null,
            isToday ? "today" : null,
          ]
            .filter(Boolean)
            .join(", ");
          const predictedPeriod = !d.isPeriod && d.predicted && d.phase === "menstrual";
          return (
            <button
              key={d.date}
              type="button"
              disabled={future || pendingDate !== null}
              onClick={() => onToggle(d)}
              aria-pressed={d.isPeriod}
              aria-label={label}
              data-date={d.date}
              className="relative flex h-12 flex-col items-center justify-start gap-[3px] pt-1 text-[11px] disabled:cursor-default disabled:opacity-50"
            >
              {isToday ? <span aria-hidden="true" className="absolute inset-0 border-2 border-ink" /> : null}
              <span
                aria-hidden="true"
                className={`relative flex size-6 items-center justify-center font-semibold ${
                  d.isPeriod ? "bg-red font-extrabold text-white" : predictedPeriod ? "border border-dashed border-red" : ""
                }`}
              >
                {pendingDate === d.date ? "…" : n}
              </span>
              <span aria-hidden="true" className="relative text-[8px] leading-none font-extrabold">
                {d.isPeriod && d.flow ? FLOW_CODE[d.flow] : " "}
              </span>
              <span
                aria-hidden="true"
                className="absolute right-0.5 bottom-0.5 left-0.5 h-1"
                style={d.phase ? { ...phaseCellStyle(d.phase, d.predicted), border: "none" } : undefined}
              />
            </button>
          );
        })}
      </div>
      <Rule />
      <PhaseLegend />
      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        Tap a day to mark or unmark it. Flow: S spotting · L light · M medium · H heavy.
      </p>
    </Slip>
  );
}

function PeriodLogSlip({ periods, onEdit }: { periods: LoggedPeriod[]; onEdit: (p: LoggedPeriod) => void }) {
  const shown = periods.slice(0, 6);
  return (
    <Slip aria-label="Period log" data-testid="period-log">
      <p className="text-[11px] font-extrabold tracking-[0.1em] text-muted">PERIOD LOG</p>
      {shown.length === 0 ? (
        <p className="mt-2">No periods logged yet.</p>
      ) : (
        <ul className="mt-1">
          {shown.map((p) => {
            const len = diffDays(p.start, p.end) + 1;
            const flows = p.days.map((d) => (d.flow ? FLOW_CODE[d.flow] : "·")).join(" ");
            return (
              <li key={p.start} className="flex items-center justify-between gap-2 border-b border-dashed border-rule py-1.5 last:border-b-0">
                <div>
                  <div className="font-extrabold">
                    {shortDate(p.start)}
                    {p.end !== p.start ? ` – ${shortDate(p.end)}` : ""} · {len} DAY{len === 1 ? "" : "S"}
                  </div>
                  <div className="text-[10px] text-muted" aria-label="Flow per day">
                    FLOW {flows}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(p)}
                  className="min-h-11 px-2 font-extrabold underline underline-offset-2"
                  aria-label={`Edit period starting ${shortDate(p.start)}`}
                >
                  EDIT
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Slip>
  );
}

export function CycleScreen({
  view,
  weekStartsOn,
  defaultPeriodLen,
}: {
  view: CycleView;
  weekStartsOn: number;
  defaultPeriodLen: number;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<{ editing: LoggedPeriod | null } | null>(null);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(d: CycleCalendarDay) {
    setError(null);
    setPendingDate(d.date);
    startTransition(async () => {
      const res = await putJson("/api/period-days", {
        action: "replace",
        from: d.date,
        to: d.date,
        days: d.isPeriod ? [] : [{ date: d.date, flow: null }],
      });
      if (!res.ok) setError(res.error.message);
      router.refresh();
      setPendingDate(null);
    });
  }

  return (
    <div className="md:grid md:grid-cols-2 md:gap-x-6">
      <div>
        <SummarySlip view={view} onLog={() => setSheet({ editing: null })} />
        <div className="mt-5 hidden md:block">
          <PrimaryButton type="button" onClick={() => setSheet({ editing: null })}>
            + LOG PERIOD
          </PrimaryButton>
        </div>
        <PeriodLogSlip periods={view.periods} onEdit={(p) => setSheet({ editing: p })} />
      </div>
      <div>
        <MonthSlip view={view} weekStartsOn={weekStartsOn} onToggle={toggle} pendingDate={pendingDate} />
        {error ? (
          <p role="alert" className="mt-3 border-2 border-red bg-paper px-3 py-2 text-xs font-extrabold text-red">
            {error}
          </p>
        ) : null}
      </div>
      <div className="sticky bottom-4 mt-6 md:hidden">
        <PrimaryButton type="button" onClick={() => setSheet({ editing: null })}>
          + LOG PERIOD
        </PrimaryButton>
      </div>
      {sheet ? (
        <LogPeriodSheet
          editing={sheet.editing}
          today={view.today}
          defaultPeriodLen={defaultPeriodLen}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
