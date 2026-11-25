import Link from "next/link";
import { Suspense } from "react";
import { LedgerHeader, LedgerPage, LedgerSkeleton, TYPE_ORDER } from "@/components/ledger/ledger-shell";
import { WeekChart } from "@/components/ledger/week-chart";
import { requirePageSession } from "@/lib/activities/page-data";
import { TYPE_LABEL } from "@/lib/domain/activity-types";
import { shiftDate, type BoardDay } from "@/lib/domain/board";
import { addDays, formatSpan, weekdayShort } from "@/lib/domain/dates";
import { formatDistance } from "@/lib/domain/units";
import { loadBoard } from "@/lib/board/load";
import { pageDate } from "@/lib/validation/board";

const SEG_CLASS = {
  running: "bg-ink",
  strength: "bg-red",
  walking: "bg-[repeating-linear-gradient(90deg,#1B1B1B_0_2px,transparent_2px_4px)]",
} as const;

function items(day: BoardDay) {
  return day.activities.map((a) => TYPE_LABEL[a.type]).join(" + ");
}

function Legend() {
  return (
    <div className="mt-2.5 flex gap-3.5 text-[11px] text-[#333]">
      {TYPE_ORDER.map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-1.5 w-3.5 ${SEG_CLASS[t]}`} />
          {TYPE_LABEL[t]}
        </span>
      ))}
    </div>
  );
}

async function WeekLedger({ searchParams }: { searchParams: PageProps<"/week">["searchParams"] }) {
  const sp = await searchParams;
  const { supabase, prefs } = await requirePageSession();
  const date = pageDate(sp.date, prefs.today);
  const { data, error } = await loadBoard(supabase, prefs, "week", date);
  if (error) throw new Error("Could not load the week ledger");

  const { range, days, totals } = data;
  const prev = shiftDate("week", range.start, -1);
  const next = shiftDate("week", range.start, 1);
  const maxMinutes = Math.max(1, ...days.map((d) => d.minutes));
  const unit = prefs.units.distance;

  return (
    <LedgerPage>
      <LedgerHeader
        left={formatSpan(range.start, range.end)}
        right="STATEMENT"
        title={
          <>
            Weekly
            <br />
            statement
          </>
        }
        prev={{ href: `/week?date=${prev}`, label: `Previous week, ${formatSpan(prev, addDays(range.start, -1))}` }}
        next={next <= prefs.today ? { href: `/week?date=${next}`, label: `Next week, ${formatSpan(next, addDays(next, 6))}` } : null}
      />

      <div className="mt-5 rotate-[0.8deg]">
        <div className="bg-paper px-[18px] py-4 text-[13px] text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
          <WeekChart
            summary={`Active minutes per day: ${days.map((d) => `${weekdayShort(d.date)} ${d.minutes}`).join(", ")}`}
            days={days.map((d) => ({
              label: weekdayShort(d.date).charAt(0),
              running: d.minutesByType.running,
              strength: d.minutesByType.strength,
              walking: d.minutesByType.walking,
            }))}
          />

          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-dashed border-ink text-[11px] font-semibold text-muted">
                <th scope="col" className="w-11 pb-1.5 text-left font-semibold">DAY</th>
                <th scope="col" className="pb-1.5 text-left font-semibold">ITEMS</th>
                <th scope="col" className="w-14 pb-1.5 text-right font-semibold">MIN</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const notYet = d.activities.length === 0 && d.date >= prefs.today;
                const label = d.activities.length ? items(d) : notYet ? "NOT YET RUNG UP" : "REST DAY · NO CHARGE";
                return (
                  <tr key={d.date} className="border-b border-dotted border-[#BBB]" aria-current={d.date === prefs.today ? "date" : undefined}>
                    <th scope="row" className="py-2 text-left font-extrabold">
                      <Link href={`/day?date=${d.date}`} className="hover:text-blue" aria-label={`${weekdayShort(d.date)} receipt`}>
                        {weekdayShort(d.date)}
                      </Link>
                    </th>
                    <td className="py-2">
                      <span className="flex flex-col gap-1">
                        <span className="text-xs">{label}</span>
                        {d.minutes ? (
                          <span aria-hidden="true" className="flex h-1.5 gap-0.5">
                            {TYPE_ORDER.filter((t) => d.minutesByType[t]).map((t) => (
                              <span key={t} className={SEG_CLASS[t]} style={{ width: `${(d.minutesByType[t] / maxMinutes) * 100}%` }} />
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-2 text-right font-extrabold">{notYet ? "—" : d.minutes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-3 flex justify-between text-lg font-extrabold">
            <span>WEEK TOTAL</span>
            <span data-testid="week-total">{totals.minutes} MIN</span>
          </div>
          <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-muted">
            <span>ACTIVE DAYS {totals.activeDays}/7</span>
            <span>
              RUN {formatDistance(totals.distanceM.running, unit)} {unit.toUpperCase()} · WALK{" "}
              {formatDistance(totals.distanceM.walking, unit)} {unit.toUpperCase()}
            </span>
          </div>
          <Legend />
        </div>
      </div>
    </LedgerPage>
  );
}

export default function WeekLedgerPage(props: PageProps<"/week">) {
  return (
    <Suspense fallback={<LedgerSkeleton />}>
      <WeekLedger searchParams={props.searchParams} />
    </Suspense>
  );
}
