import Link from "next/link";
import { Suspense } from "react";
import { LedgerCards, LedgerCardsView } from "@/components/ledger/home-ledger-cards";
import { RecentOrders } from "@/components/recent-orders";
import { SignedInAs } from "@/components/signed-in-as";
import { placeholderTag, TypeBadge } from "@/components/ui";
import { listActivities } from "@/lib/activities/repo";
import { requirePageSession } from "@/lib/activities/page-data";
import { addDays, formatReceiptDate } from "@/lib/domain/dates";

const FRESH = [
  { href: "/log/run", type: "running", label: "RUN", hint: "per km →" },
  { href: "/log/strength", type: "strength", label: "STRENGTH", hint: "per set →" },
  { href: "/log/walk", type: "walking", label: "WALK", hint: "per step →" },
] as const;

async function TodayStamp() {
  const { prefs } = await requirePageSession();
  return <span>{formatReceiptDate(prefs.today)} · OPEN</span>;
}

async function Recent() {
  const { supabase, prefs } = await requirePageSession();
  const { data } = await listActivities(supabase, { from: addDays(prefs.today, -13), to: addDays(prefs.today, 1) });
  return <RecentOrders activities={data ?? []} units={prefs.units} today={prefs.today} />;
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-28">
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.06em] text-white">
        <span className="font-extrabold">GRIT GIRL</span>
        <Suspense fallback={<span>OPEN</span>}>
          <TodayStamp />
        </Suspense>
      </div>
      <h1 className="mt-2.5 font-display text-[38px] leading-[0.98] font-extrabold tracking-tight text-white">
        What are we
        <br />
        ringing up today?
      </h1>

      <section aria-labelledby="ledgers" className="mt-5">
        <h2 id="ledgers" className="sr-only">
          Ledgers
        </h2>
        <Suspense fallback={<LedgerCardsView numbers={{ day: null, week: null, month: null }} />}>
          <LedgerCards />
        </Suspense>
      </section>

      {/* Regulars (templates): placeholder until the templates milestone (M4). */}
      <section aria-labelledby="usual" className="mt-6">
        <div className="flex items-baseline justify-between text-white">
          <h2 id="usual" className="text-[13px] font-extrabold tracking-[0.1em]">
            THE USUAL?
          </h2>
          <span className="py-2.5 text-xs font-extrabold opacity-70">ALL REGULARS →</span>
        </div>
        <div className="mt-1 border-2 border-dashed border-paper/70 p-3 text-white">
          <span className={placeholderTag}>COMING SOON</span>
          <p className="mt-1.5 text-xs leading-relaxed">
            Your regulars (saved runs, walks and lifts you can ring up in one tap) arrive in the next
            update. Order fresh for now.
          </p>
        </div>
      </section>

      <section aria-labelledby="fresh">
        <h2 id="fresh" className="mt-5 text-[13px] font-extrabold tracking-[0.1em] text-white">
          OR ORDER FRESH
        </h2>
        <div className="mt-2 bg-paper px-3 py-1">
          {FRESH.map((f, i) => (
            <Link
              key={f.href}
              href={f.href}
              className={`grid grid-cols-[30px_1fr_auto] items-center gap-2 py-2.5 text-ink hover:text-blue ${
                i < FRESH.length - 1 ? "border-b border-dotted border-rule" : ""
              }`}
            >
              <TypeBadge type={f.type} />
              <span className="font-display text-xl font-extrabold">{f.label}</span>
              <span className="text-[11px] text-muted">{f.hint}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="recent" className="mt-6">
        <h2 id="recent" className="text-[13px] font-extrabold tracking-[0.1em] text-white">
          RECENT ORDERS
        </h2>
        <Suspense fallback={<div className="mt-2 h-24 animate-pulse bg-paper/40" />}>
          <Recent />
        </Suspense>
      </section>

      <section className="receipt mt-6 p-3">
        <Suspense fallback={<p className="text-xs">…</p>}>
          <SignedInAs />
        </Suspense>
      </section>
    </main>
  );
}
