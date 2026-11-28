import Link from "next/link";
import { Suspense } from "react";
import { BloodBankNote, PenCircle } from "@/components/cycle/marks";
import { LedgerHeader, LedgerPage, LedgerSkeleton, TYPE_ORDER } from "@/components/ledger/ledger-shell";
import { WeekChart } from "@/components/ledger/week-chart";
import { requirePageSession } from "@/lib/activities/page-data";
import { TYPE_LABEL } from "@/lib/domain/activity-types";
import { shiftDate, type BoardDay } from "@/lib/domain/board";
import { addDays, formatSpan, weekdayShort } from "@/lib/domain/dates";
import { marksByDate } from "@/lib/domain/ledger-periods";
import { formatDistance } from "@/lib/domain/units";
import { loadBoard } from "@/lib/board/load";
import { pageDate } from "@/lib/validation/board";

const SEG_CLASS = {
  running: "bg-ink",
  strength: "bg-red",
  walking: "bg-[repeating-linear-gradient(90deg,#1B1B1B_0_2px,transparent_2px_4px)]",
} as const;

/** CycWeek: the row's loop spills 10px left/right and 3px above/below. */
const WIDE_LOOP = { left: -10, top: -3, width: "calc(100% + 20px)", height: "calc(100% + 6px)" } as const;

function items(day: BoardDay) {
  return day.activities.map((a) => TYPE_LABEL[a.type]).join(" + ");
}

function Legend({ period }: { period: boolean }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#333]">
      {TYPE_ORDER.map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-1.5 w-3.5 ${SEG_CLASS[t]}`} />
          {TYPE_LABEL[t]}
        </span>
      ))}
      {period ? (
        <span className="flex items-center gap-1.5 font-extrabold text-blood">
          <span aria-hidden="true" className="box-border h-2.5 w-3.5 rounded-[50%] border-2 border-blood" />
          PERIOD
        </span>
      ) : null}
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
  const marks = marksByDate(data.periodMarks);

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
            summary={`Active minutes per day: ${days.map((d) => `${weekdayShort(d.date)} ${d.minutes}`).join(", ")}${
              marks.size ? `. Period days: ${days.filter((d) => marks.has(d.date)).map((d) => weekdayShort(d.date)).join(", ")}` : ""
            }`}
            days={days.map((d) => ({
              label: weekdayShort(d.date).charAt(0),
              running: d.minutesByType.running,
              strength: d.minutesByType.strength,
              walking: d.minutesByType.walking,
              period: marks.has(d.date),
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
                const mark = marks.get(d.date);
                return (
                  <tr
                    key={d.date}
                    className="relative border-b border-dotted border-[#BBB]"
                    aria-current={d.date === prefs.today ? "date" : undefined}
                    data-period-day={mark?.day}
                  >
                    <th scope="row" className="py-2 text-left font-extrabold">
                      {/* Positioned against the row: the pen loop goes round all three cells. */}
                      {mark ? <PenCircle variant="wide" style={WIDE_LOOP} /> : null}
                      <Link href={`/day?date=${d.date}`} className="hover:text-blue" aria-label={`${weekdayShort(d.date)} receipt`}>
                        {weekdayShort(d.date)}
                      </Link>
                    </th>
                    <td className="py-2">
                      <span className="flex flex-col gap-1">
                        <span className="text-xs">{label}</span>
                        {mark ? <BloodBankNote day={mark.day} /> : null}
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
          <Legend period={marks.size > 0} />
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
