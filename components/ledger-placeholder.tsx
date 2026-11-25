import { placeholderTag } from "@/components/ui";

/** Stand-in for the Day / Week / Month ledgers until the ledger milestone (M6). */
export function LedgerPlaceholder({ view }: { view: "DAY" | "WEEK" | "MONTH" }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-28">
      <p className="text-xs font-extrabold tracking-[0.06em] text-white">GRIT GIRL</p>
      <h1 className="mt-2.5 font-display text-[38px] leading-[0.98] font-extrabold tracking-tight text-white">
        {view.charAt(0) + view.slice(1).toLowerCase()} ledger
      </h1>
      <section className="receipt mt-6 border-b-[3px] border-dashed border-blue p-4">
        <span className={placeholderTag}>COMING SOON</span>
        <p className="mt-2 font-display text-xl font-extrabold">The {view.toLowerCase()} ledger is being printed.</p>
        <p className="mt-2 text-xs leading-relaxed">
          Totals, phase bands and the {view.toLowerCase()} view arrive in the ledger update. Your logged activities
          are listed under Recent orders on the home screen.
        </p>
      </section>
    </main>
  );
}
