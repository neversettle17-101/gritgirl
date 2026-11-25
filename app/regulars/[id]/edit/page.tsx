import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RegularEditor } from "@/components/regulars/regular-editor";
import { requirePageSession } from "@/lib/activities/page-data";
import { getTemplate } from "@/lib/templates/repo";
import { uuidParam } from "@/lib/validation/activities";
import { SlipSkeleton } from "@/app/log/cardio-page";

async function Editor({ params }: { params: PageProps<"/regulars/[id]/edit">["params"] }) {
  const { id } = await params;
  if (!uuidParam.safeParse(id).success) notFound();
  const { supabase, prefs } = await requirePageSession();
  const { data: template } = await getTemplate(supabase, id);
  // Archived regulars behave as deleted.
  if (!template || template.archived) notFound();
  return <RegularEditor key={template.id} mode="edit" units={prefs.units} template={template} />;
}

export default function EditRegularPage({ params }: PageProps<"/regulars/[id]/edit">) {
  return (
    <Suspense fallback={<SlipSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}
