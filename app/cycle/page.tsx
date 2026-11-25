import { Suspense } from "react";
import { ScreenHeader } from "@/components/cycle/slip";
import { requireOnboarded } from "@/lib/cycle/server";
import { buildCycleView, userToday } from "@/lib/cycle/service";
import { monthLabel } from "@/lib/domain/dates";
import { CycleScreen } from "./cycle-screen";

export const metadata = { title: "Cycle · Grit Girl" };

async function CycleBody({ searchParams }: { searchParams: PageProps<"/cycle">["searchParams"] }) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : null;
  const { repo, settings } = await requireOnboarded(month ? `/cycle?month=${month}` : "/cycle");
  const days = await repo.listPeriodDays();
  const view = buildCycleView(settings, days, userToday(settings), month);
  return (
    <>
      <p className="sr-only">Showing {monthLabel(view.month)}</p>
      <CycleScreen view={view} weekStartsOn={settings.weekStartsOn} defaultPeriodLen={settings.defaultPeriodLen} />
    </>
  );
}

export default function CyclePage(props: PageProps<"/cycle">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-13 pb-10 md:max-w-2xl">
      <ScreenHeader backHref="/" right="CYCLE SLIP" title={<>Cycle<br />slip</>} />
      <Suspense fallback={<p className="mt-6 text-xs text-paper">Printing your slip…</p>}>
        <CycleBody searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
