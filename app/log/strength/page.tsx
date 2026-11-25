import { Suspense } from "react";
import { StrengthSlip } from "@/components/strength/strength-slip";
import { requirePageSession } from "@/lib/activities/page-data";
import { timeIn } from "@/lib/domain/dates";
import { SlipSkeleton } from "../cardio-page";

async function Slip() {
  const { prefs } = await requirePageSession();
  return <StrengthSlip mode="new" weightUnit={prefs.units.weight} today={prefs.today} nowTime={timeIn(prefs.timezone)} />;
}

export default function LogStrengthPage() {
  return (
    <Suspense fallback={<SlipSkeleton />}>
      <Slip />
    </Suspense>
  );
}
