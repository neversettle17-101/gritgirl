import { Suspense } from "react";
import { StrengthSlip } from "@/components/strength/strength-slip";
import { requirePageSession } from "@/lib/activities/page-data";
import { timeIn } from "@/lib/domain/dates";
import { lastSetsForTemplate, progressHintsForTemplate, regularForSlip } from "@/lib/templates/page-data";
import { SlipSkeleton } from "../cardio-page";

async function Slip({ searchParams }: { searchParams: PageProps<"/log/strength">["searchParams"] }) {
  const [{ supabase, prefs }, sp] = await Promise.all([requirePageSession(), searchParams]);
  const regular = await regularForSlip(supabase, sp.regular, "strength");
  const [lasts, hints] = regular
    ? await Promise.all([lastSetsForTemplate(supabase, regular), progressHintsForTemplate(supabase, regular, prefs)])
    : [undefined, undefined];
  return (
    <StrengthSlip
      key={regular?.id ?? "fresh"}
      mode="new"
      weightUnit={prefs.units.weight}
      today={prefs.today}
      nowTime={timeIn(prefs.timezone)}
      regular={regular}
      lasts={lasts}
      hints={hints}
    />
  );
}

/** `?regular=<id>` rings up a saved strength regular, pre-filled from last time. */
export default function LogStrengthPage({ searchParams }: PageProps<"/log/strength">) {
  return (
    <Suspense fallback={<SlipSkeleton />}>
      <Slip searchParams={searchParams} />
    </Suspense>
  );
}
