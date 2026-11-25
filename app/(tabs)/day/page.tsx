import Link from "next/link";
import { Suspense } from "react";
import { DayReceipt } from "@/components/ledger/day-receipt";
import { LedgerHeader, LedgerPage, LedgerSkeleton } from "@/components/ledger/ledger-shell";
import { PrinterIcon, printButtonClass } from "@/components/ui";
import { requirePageSession } from "@/lib/activities/page-data";
import { loadBoard } from "@/lib/board/load";
import { shiftDate } from "@/lib/domain/board";
import { daysBetween, formatReceiptDate, weekdayLong } from "@/lib/domain/dates";
import { pageDate } from "@/lib/validation/board";

function title(date: string, today: string) {
  const ago = daysBetween(date, today);
  if (ago === 0) return "Today's";
  if (ago === 1) return "Yesterday's";
  return `${weekdayLong(date)}'s`;
}

/** Day-of-year, as the receipt number: "#332". */
function receiptNo(date: string) {
  return String(daysBetween(`${date.slice(0, 4)}-01-01`, date) + 1).padStart(3, "0");
}

async function DayLedger({ searchParams }: { searchParams: PageProps<"/day">["searchParams"] }) {
  const sp = await searchParams;
  const { supabase, prefs } = await requirePageSession();
  const date = pageDate(sp.date, prefs.today);
  const { data, error } = await loadBoard(supabase, prefs, "day", date);
  if (error) throw new Error("Could not load the day ledger");

  const prev = shiftDate("day", date, -1);
  const next = shiftDate("day", date, 1);
  const day = data.days[0]!;

  return (
    <LedgerPage>
      <LedgerHeader
        left={formatReceiptDate(date)}
        right={`RECEIPT #${receiptNo(date)}`}
        title={
          <>
            {title(date, prefs.today)}
            <br />
            receipt
          </>
        }
        prev={{ href: `/day?date=${prev}`, label: `Previous day, ${formatReceiptDate(prev)}` }}
        next={next <= prefs.today ? { href: `/day?date=${next}`, label: `Next day, ${formatReceiptDate(next)}` } : null}
      />
      <DayReceipt
        activities={data.activities ?? []}
        minutes={day.minutes}
        streak={data.streaks.current}
        isToday={date === prefs.today}
        isFuture={date > prefs.today}
        units={prefs.units}
        date={date}
      />
      <Link
        href={`/week?date=${date}`}
        className="mt-4 flex h-11 items-center justify-end text-xs font-extrabold tracking-[0.06em] text-white hover:text-yellow focus-visible:ring-2 focus-visible:ring-yellow"
      >
        THIS WEEK&apos;S STATEMENT →
      </Link>
      <Link href="/" className={`mt-4 ${printButtonClass}`}>
        <PrinterIcon />
        PRINT A WORKOUT
      </Link>
    </LedgerPage>
  );
}

export default function DayLedgerPage(props: PageProps<"/day">) {
  return (
    <Suspense fallback={<LedgerSkeleton />}>
      <DayLedger searchParams={props.searchParams} />
    </Suspense>
  );
}
