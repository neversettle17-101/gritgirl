import Link from "next/link";
import { Suspense } from "react";
import { LedgerHeader, LedgerPage, LedgerSkeleton, TornEdge } from "@/components/ledger/ledger-shell";
import { WeekChart } from "@/components/ledger/week-chart";
import { requirePageSession } from "@/lib/activities/page-data";
import { monthlyBreakdown, shiftDate } from "@/lib/domain/board";
import { monthLong, monthShort } from "@/lib/domain/dates";
import { formatDistance, fromKg } from "@/lib/domain/units";
import { loadBoard } from "@/lib/board/load";
import { pageDate } from "@/lib/validation/board";

const plural = (n: number, one: string, many = `${one}S`) => `${n} ${n === 1 ? one : many}`;

/** "12,480" — whole units with a thousands separator. */
const whole = (n: number) => Math.round(n).toLocaleString("en-US");

async function YearLedger({ searchParams }: { searchParams: PageProps<"/year">["searchParams"] }) {
  const sp = await searchParams;
  const { supabase, prefs } = await requirePageSession();
  const date = pageDate(sp.date, prefs.today);
  const { data, error } = await loadBoard(supabase, prefs, "year", date);
  if (error) throw new Error("Could not load the year ledger");

  const { range, totals, streaks } = data;
  const year = range.start.slice(0, 4);
  // range.start is 1 Jan, so these are 1 Jan of the neighbouring years.
  const prev = shiftDate("year", range.start, -1);
  const next = shiftDate("year", range.start, 1);
  const months = monthlyBreakdown(data);
  const { distance, weight } = prefs.units;
  const isThisYear = prefs.today >= range.start && prefs.today <= range.end;

  return (
    <LedgerPage>
      <LedgerHeader
        left={year}
        right="ANNUAL REPORT"
        title={
          <>
            Yearly
            <br />
            ledger
          </>
        }
        prev={{ href: `/year?date=${prev}`, label: `Previous year, ${prev.slice(0, 4)}` }}
        next={next <= prefs.today ? { href: `/year?date=${next}`, label: `Next year, ${next.slice(0, 4)}` } : null}
      />

      <div className="mt-[18px] -rotate-[0.6deg]">
        <div className="bg-paper px-3.5 pt-3.5 pb-3 text-[13px] text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
          <WeekChart
            testId="year-chart"
            height={120}
            summary={`Active minutes per month: ${months.map((m) => `${monthShort(m.month)} ${m.minutes}`).join(", ")}`}
            days={months.map((m) => ({
              label: monthShort(m.month).charAt(0),
              running: m.minutesByType.running,
              strength: m.minutesByType.strength,
              walking: m.minutesByType.walking,
            }))}
          />

          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-dashed border-ink text-[11px] font-semibold text-muted">
                <th scope="col" className="w-12 pb-1.5 text-left font-semibold">MONTH</th>
                <th scope="col" className="pb-1.5 text-left font-semibold">R · S · W</th>
                <th scope="col" className="w-12 pb-1.5 text-right font-semibold">QTY</th>
                <th scope="col" className="w-14 pb-1.5 text-right font-semibold">MIN</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const notYet = m.month > prefs.today;
                const current = m.month.slice(0, 7) === prefs.today.slice(0, 7);
                return (
                  <tr
                    key={m.month}
                    className="border-b border-dotted border-[#BBB]"
                    aria-current={current ? "date" : undefined}
                  >
                    <th scope="row" className="py-1.5 text-left font-extrabold">
                      <Link
                        href={`/month?date=${m.month}`}
                        className="inline-flex min-h-8 items-center hover:text-blue"
                        aria-label={`${monthLong(m.month)} ${year} ledger`}
                      >
                        {monthShort(m.month)}
                      </Link>
                    </th>
                    <td className="py-1.5 text-xs">
                      {notYet ? "NOT YET OPEN" : m.workouts ? `${m.runs} · ${m.strength} · ${m.walks}` : "NO CHARGE"}
                    </td>
                    <td className="py-1.5 text-right font-extrabold">{notYet ? "—" : m.workouts}</td>
                    <td className="py-1.5 text-right font-extrabold">{notYet ? "—" : m.minutes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs font-extrabold">TAP A MONTH FOR ITS LEDGER</p>
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
          <span>ACTIVE DAYS</span>
          <span>{totals.activeDays}</span>
        </div>
        <div className="flex justify-between">
          <span>ACTIVE MINUTES</span>
          <span data-testid="year-minutes">{whole(totals.minutes)} MIN</span>
        </div>
        <div className="flex justify-between">
          <span>RUN DISTANCE</span>
          <span>
            {formatDistance(totals.distanceM.running, distance, 1)} {distance.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between">
          <span>WALK DISTANCE</span>
          <span>
            {formatDistance(totals.distanceM.walking, distance, 1)} {distance.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between">
          <span>STRENGTH VOLUME</span>
          <span>
            {whole(fromKg(totals.volumeKg, weight))} {weight.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between">
          <span>LONGEST STREAK</span>
          <span>{plural(streaks.longest, "DAY")}</span>
        </div>
        {isThisYear ? (
          <div className="flex justify-between">
            <span>CURRENT STREAK</span>
            <span>{plural(streaks.current, "DAY")}</span>
          </div>
        ) : null}
        <div className="mt-1 border-t-2 border-dashed border-ink" />
        <div className="flex justify-between text-base font-extrabold">
          <span>YEAR TOTAL</span>
          <span data-testid="year-total">{plural(totals.workouts, "WORKOUT")}</span>
        </div>
      </div>
    </LedgerPage>
  );
}

export default function YearLedgerPage(props: PageProps<"/year">) {
  return (
    <Suspense fallback={<LedgerSkeleton />}>
      <YearLedger searchParams={props.searchParams} />
    </Suspense>
  );
}
