import { Suspense } from "react";
import { SignedInAs } from "@/components/signed-in-as";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-14 pb-10">
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.06em] text-paper">
        <span className="font-extrabold">GRIT GIRL</span>
        <span>OPEN</span>
      </div>
      <h1 className="mt-2.5 font-display text-[38px] leading-[0.98] font-extrabold tracking-tight text-paper">
        What are we
        <br />
        ringing up today?
      </h1>

      <section className="receipt mt-6 border-b-[3px] border-dashed border-blue p-4">
        <p className="text-[10px] font-extrabold tracking-[0.1em] text-muted">COMING SOON</p>
        <p className="mt-1 font-display text-xl font-extrabold">The till is being set up.</p>
        <p className="mt-2 text-xs leading-relaxed">
          Run, walk and strength logging, your regulars, and the day, week and month ledgers
          arrive in the next milestones.
        </p>
      </section>

      <section className="receipt mt-4 p-4">
        <Suspense fallback={<p className="text-xs">…</p>}>
          <SignedInAs />
        </Suspense>
      </section>
    </main>
  );
}
