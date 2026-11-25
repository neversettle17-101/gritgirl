import { Suspense } from "react";
import { CardioSlip } from "@/components/cardio-slip";
import { requirePageSession } from "@/lib/activities/page-data";
import { timeIn } from "@/lib/domain/dates";
import { regularForSlip } from "@/lib/templates/page-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Slip({ type, searchParams }: { type: "running" | "walking"; searchParams: SearchParams }) {
  const [{ supabase, prefs }, sp] = await Promise.all([requirePageSession(), searchParams]);
  const regular = await regularForSlip(supabase, sp.regular, "cardio");
  return (
    <CardioSlip
      key={regular?.id ?? "fresh"}
      mode="new"
      type={regular && regular.type !== "strength" ? regular.type : type}
      distanceUnit={prefs.units.distance}
      today={prefs.today}
      nowTime={timeIn(prefs.timezone)}
      regular={regular}
    />
  );
}

/** Shared by /log/run and /log/walk. `?regular=<id>` rings up a saved regular. */
export function CardioLogPage({ type, searchParams }: { type: "running" | "walking"; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<SlipSkeleton />}>
      <Slip type={type} searchParams={searchParams} />
    </Suspense>
  );
}

export function SlipSkeleton() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pt-14" aria-busy="true">
      <div className="mt-24 h-[520px] animate-pulse bg-paper/40" />
    </main>
  );
}
