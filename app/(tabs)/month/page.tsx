import Link from "next/link";
import { Suspense } from "react";
import { LedgerHeader, LedgerPage, LedgerSkeleton, TornEdge, TYPE_ORDER } from "@/components/ledger/ledger-shell";
import { MonthGrid, type MonthGridCell } from "@/components/ledger/month-grid";
import { requirePageSession } from "@/lib/activities/page-data";
import { TYPE_LABEL } from "@/lib/domain/activity-types";
import { addMonths, type BoardDay } from "@/lib/domain/board";
import { formatMonthYear, monthLong, weekdayShort } from "@/lib/domain/dates";
import { formatPeriodSpans, marksByDate, periodSpans } from "@/lib/domain/ledger-periods";
import { periodDayLabel, type PeriodMark } from "@/lib/domain/period-marks";
import { loadBoard } from "@/lib/board/load";
import { pageDate } from "@/lib/validation/board";

const footLink =
  "flex h-11 items-center text-xs font-extrabold tracking-[0.06em] text-white hover:text-yellow focus-visible:ring-2 focus-visible:ring-yellow";

function dayLabel(d: BoardDay, today: string) {
  const types = TYPE_ORDER.filter((t) => d.activities.some((a) => a.type === t));
  if (types.length) return types.map((t) => TYPE_LABEL[t]).join(" + ");
  return d.date >= today ? "NOT YET RUNG UP" : "REST DAY · NO CHARGE";
}

/** One grid cell's data, with the CycMonth caption and aria-label. */
function cell(d: BoardDay, today: string, mark: PeriodMark | undefined): MonthGridCell {
  const n = Number(d.date.slice(8));
  const label = dayLabel(d, today);
  const isToday = d.date === today;
  const tail = isToday ? " · TODAY" : "";
  return {
    date: d.date,
    inPeriod: d.inPeriod,
    n,
    types: TYPE_ORDER.filter((t) => d.activities.some((a) => a.type === t)),
    today: isToday,
    periodDay: mark?.day ?? null,
    ariaLabel: `${n} ${monthLong(d.date)}: ${label}${mark ? `, period day ${mark.day}` : ""}${tail}`,
    caption: `${weekdayShort(d.date)} ${n} · ${mark ? `BLOOD BANK DOWN (${periodDayLabel(mark)}) · ` : ""}${label}${tail}`,
  };
}

async function MonthLedger({ searchParams }: { searchParams: PageProps<"/month">["searchParams"] }) {
  const sp = await searchParams;
  const { supabase, prefs } = await requirePageSession();
  const date = pageDate(sp.date, prefs.today);
  const { data, error } = await loadBoard(supabase, prefs, "month", date);
  if (error) throw new Error("Could not load the month ledger");

  const { range, days, totals, streaks } = data;
  // range.start is the 1st, so these are the 1st of the neighbouring months.
  const prev = addMonths(range.start, -1);
  const next = addMonths(range.start, 1);
  const header = days.slice(0, 7).map((d) => weekdayShort(d.date).charAt(0));
  // The weekly statement for this month: this week if today is in it, else its first week.
  const weekDate = prefs.today >= range.start && prefs.today <= range.end ? prefs.today : range.start;
  const marks = marksByDate(data.periodMarks);
  const cells = days.map((d) => cell(d, prefs.today, d.inPeriod ? marks.get(d.date) : undefined));
  const bloodBank = formatPeriodSpans(periodSpans(data.periodMarks, { from: range.start, to: range.end }));

  return (
    <LedgerPage>
      <LedgerHeader
        left={formatMonthYear(range.start)}
        right={
          <Link
            href={`/year?date=${range.start}`}
            className="-my-3.5 inline-flex h-11 items-center font-extrabold text-white underline decoration-2 underline-offset-4 hover:text-yellow focus-visible:ring-2 focus-visible:ring-yellow"
          >
            YEAR VIEW →
          </Link>
        }
        title={
          <>
            Monthly
            <br />
            ledger
          </>
        }
        prev={{ href: `/month?date=${prev}`, label: `Previous month, ${monthLong(prev)}` }}
        next={next <= prefs.today ? { href: `/month?date=${next}`, label: `Next month, ${monthLong(next)}` } : null}
      />

      <div className="mt-[18px] -rotate-[0.6deg]">
        <div className="bg-paper px-3.5 pt-3.5 pb-3 text-xs text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
          <div
            aria-hidden="true"
            className="mb-1.5 grid grid-cols-7 gap-[3px] border-b-2 border-dashed border-ink pb-1.5 text-center text-[11px] font-extrabold"
          >
            {header.map((h, i) => (
              <span key={i}>{h}</span>
            ))}
          </div>
          <MonthGrid cells={cells} />
        </div>
        <TornEdge />
      </div>

      <div className="mt-3.5 rotate-[0.6deg] bg-paper px-3.5 py-3 text-xs leading-[1.7] text-ink shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
        <div className="flex justify-between">
          <span>RUNS ×{totals.runs}</span>
          <span>STRENGTH ×{totals.strength}</span>
          <span>WALKS ×{totals.walks}</span>
        </div>
        <div className="flex justify-between">
          <span>LONGEST STREAK</span>
          <span>
            {streaks.longest} {streaks.longest === 1 ? "DAY" : "DAYS"}
          </span>
        </div>
        {bloodBank ? (
          <div className="flex justify-between gap-3 font-extrabold text-blood" data-testid="month-blood-bank">
            <span>BLOOD BANK DOWN</span>
            <span className="text-right">{bloodBank}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-base font-extrabold">
          <span>MONTH TOTAL</span>
          <span data-testid="month-total">
            {totals.workouts} {totals.workouts === 1 ? "WORKOUT" : "WORKOUTS"}
          </span>
        </div>
      </div>

      <nav aria-label="Other ledgers" className="mt-4 flex justify-between">
        <Link href={`/week?date=${weekDate}`} className={footLink}>
          WEEK BY WEEK →
        </Link>
      </nav>
    </LedgerPage>
  );
}

export default function MonthLedgerPage(props: PageProps<"/month">) {
  return (
    <Suspense fallback={<LedgerSkeleton />}>
      <MonthLedger searchParams={props.searchParams} />
    </Suspense>
  );
}
