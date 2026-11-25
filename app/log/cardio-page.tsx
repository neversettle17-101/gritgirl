import { Suspense } from "react";
import { CardioSlip } from "@/components/cardio-slip";
import { requirePageSession } from "@/lib/activities/page-data";
import { timeIn } from "@/lib/domain/dates";

async function Slip({ type }: { type: "running" | "walking" }) {
  const { prefs } = await requirePageSession();
  return (
    <CardioSlip
      mode="new"
      type={type}
      distanceUnit={prefs.units.distance}
      today={prefs.today}
      nowTime={timeIn(prefs.timezone)}
    />
  );
}

/** Shared by /log/run and /log/walk. */
export function CardioLogPage({ type }: { type: "running" | "walking" }) {
  return (
    <Suspense fallback={<SlipSkeleton />}>
      <Slip type={type} />
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
