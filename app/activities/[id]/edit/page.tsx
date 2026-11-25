import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardioSlip } from "@/components/cardio-slip";
import { StrengthSlip } from "@/components/strength/strength-slip";
import { getActivity } from "@/lib/activities/repo";
import { requirePageSession } from "@/lib/activities/page-data";
import { activityToCardioForm } from "@/lib/domain/cardio-form";
import { uuidParam } from "@/lib/validation/activities";
import { SlipSkeleton } from "@/app/log/cardio-page";

async function EditSlip({ params }: { params: PageProps<"/activities/[id]/edit">["params"] }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const { supabase, prefs } = await requirePageSession();
  const { data: activity } = await getActivity(supabase, id);
  if (!activity) notFound();

  if (activity.type === "strength") {
    return <StrengthSlip mode="edit" weightUnit={prefs.units.weight} activity={activity} />;
  }
  return (
    <CardioSlip
      mode="edit"
      type={activity.type}
      distanceUnit={prefs.units.distance}
      initial={activityToCardioForm(activity, prefs.units.distance)}
    />
  );
}

export default function EditActivityPage(props: PageProps<"/activities/[id]/edit">) {
  return (
    <Suspense fallback={<SlipSkeleton />}>
      <EditSlip params={props.params} />
    </Suspense>
  );
}
