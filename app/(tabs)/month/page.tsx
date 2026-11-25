import Link from "next/link";
import { Suspense } from "react";
import { LedgerHeader, LedgerPage, LedgerSkeleton, TornEdge, TYPE_ORDER } from "@/components/ledger/ledger-shell";
import { requirePageSession } from "@/lib/activities/page-data";
import { TYPE_LABEL, type ActivityType } from "@/lib/domain/activity-types";
import { addMonths, type BoardDay } from "@/lib/domain/board";
import { formatMonthYear, monthLong, weekdayShort } from "@/lib/domain/dates";
import { loadBoard } from "@/lib/board/load";
import { pageDate } from "@/lib/validation/board";

const MARKER: Record<ActivityType, { letter: string; className: string }> = {
  running: { letter: "R", className: "size-3 bg-ink text-white leading-3" },
  strength: { letter: "S", className: "size-3 bg-red text-white leading-3" },
  walking: { letter: "W", className: "size-3 border border-ink leading-[10px]" },
};

const footLink =
  "flex h-11 items-center text-xs font-extrabold tracking-[0.06em] text-white hover:text-yellow focus-visible:ring-2 focus-visible:ring-yellow";

function dayLabel(d: BoardDay, today: string) {
  const types = TYPE_ORDER.filter((t) => d.activities.some((a) => a.type === t));
  if (types.length) return types.map((t) => TYPE_LABEL[t]).join(" + ");
  return d.date >= today ? "NOT YET RUNG UP" : "REST DAY · NO CHARGE";
}

function Cell({ d, today }: { d: BoardDay; today: string }) {
  if (!d.inPeriod) return <span aria-hidden="true" className="h-11" />;
  const n = Number(d.date.slice(8));
  const label = `${n} ${monthLong(d.date)}: ${dayLabel(d, today)}${d.date === today ? " · TODAY" : ""}`;
  const types = TYPE_ORDER.filter((t) => d.activities.some((a) => a.type === t));
  return (
    <Link
      href={`/day?date=${d.date}`}
      aria-label={label}
      aria-current={d.date === today ? "date" : undefined}
      className={`flex h-11 flex-col items-center gap-[3px] pt-[3px] text-[11px] hover:bg-yellow focus-visible:bg-yellow ${
        d.date === today ? "border-2 border-ink" : ""
      }`}
    >
      <span className="font-semibold">{n}</span>
      <span aria-hidden="true" className="flex gap-px">
        {types.map((t) => (
          <span key={t} className={`text-center text-[9px] font-extrabold ${MARKER[t].className}`}>
            {MARKER[t].letter}
          </span>
        ))}
      </span>
    </Link>
  );
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

  return (
    <LedgerPage>
      <LedgerHeader
        left={formatMonthYear(range.start)}
        right="LEDGER"
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
          <div className="grid grid-cols-7 gap-[3px]">
            {days.map((d) => (
              <Cell key={d.date} d={d} today={prefs.today} />
            ))}
          </div>
          <div className="mt-2 mb-1.5 border-t-2 border-dashed border-ink" />
          <p className="min-h-4 text-xs font-extrabold">TAP A DAY FOR ITS RECEIPT</p>
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
        <Link href={`/year?date=${range.start}`} className={footLink}>
          {range.start.slice(0, 4)} LEDGER →
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
