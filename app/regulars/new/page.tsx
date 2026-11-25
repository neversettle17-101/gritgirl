import { Suspense } from "react";
import { RegularEditor } from "@/components/regulars/regular-editor";
import { requirePageSession } from "@/lib/activities/page-data";
import { SlipSkeleton } from "@/app/log/cardio-page";

async function Editor() {
  const { prefs } = await requirePageSession();
  return <RegularEditor mode="new" units={prefs.units} />;
}

export default function NewRegularPage() {
  return (
    <Suspense fallback={<SlipSkeleton />}>
      <Editor />
    </Suspense>
  );
}
