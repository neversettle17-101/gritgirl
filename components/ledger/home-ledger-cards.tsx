import Link from "next/link";
import { requirePageSession } from "@/lib/activities/page-data";
import { loadBoard } from "@/lib/board/load";
import { homeLedgerNumbers } from "@/lib/domain/board";

/** Home's DAY / WEEK / MONTH ledger shortcuts (mockup 0). */
const CARDS = [
  { key: "day", href: "/day", label: "DAY LEDGER", unit: "MIN TODAY →", tilt: "-rotate-[1.5deg]" },
  { key: "week", href: "/week", label: "WEEK LEDGER", unit: "MIN SO FAR →", tilt: "" },
  { key: "month", href: "/month", label: "MONTH LEDGER", unit: "WORKOUTS →", tilt: "rotate-[1.5deg]" },
] as const;

type Numbers = Record<(typeof CARDS)[number]["key"], number | null>;

export function LedgerCardsView({ numbers }: { numbers: Numbers }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CARDS.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className={`flex flex-col gap-0.5 border-b-[3px] border-dashed border-blue bg-paper px-2.5 pt-2.5 pb-3 text-ink hover:-translate-y-0.5 ${c.tilt}`}
        >
          <span className="text-[10px] font-extrabold tracking-[0.1em] text-muted">{c.label}</span>
          <span className="font-display text-[26px] leading-[1.1] font-extrabold" data-testid={`home-${c.key}`}>
            {numbers[c.key] ?? "—"}
          </span>
          <span className="text-[11px]">{c.unit}</span>
        </Link>
      ))}
    </div>
  );
}

export async function LedgerCards() {
  const { supabase, prefs } = await requirePageSession();
  const { data } = await loadBoard(supabase, prefs, "month", prefs.today);
  const numbers = data ? homeLedgerNumbers(data, prefs.weekStartsOn) : { day: null, week: null, month: null };
  return <LedgerCardsView numbers={numbers} />;
}
