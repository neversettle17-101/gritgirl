import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Receipt, ZigZag } from "@/components/receipt";
import { BackButton } from "@/components/ui";
import { VoidButton } from "@/components/void-button";
import { getActivity, listActivities } from "@/lib/activities/repo";
import { requirePageSession } from "@/lib/activities/page-data";
import { TYPE_LABEL } from "@/lib/domain/activity-types";
import { uuidParam } from "@/lib/validation/activities";

const bigButton =
  "flex h-[58px] items-center justify-center rounded-[14px] bg-ink text-[15px] font-extrabold tracking-[0.04em] text-white";
const outlineButton =
  "flex h-[52px] items-center justify-center rounded-[14px] border-[2.5px] border-white text-sm font-extrabold tracking-[0.04em] text-white";

async function ReceiptScreen({
  params,
  searchParams,
}: {
  params: PageProps<"/activities/[id]">["params"];
  searchParams: PageProps<"/activities/[id]">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!uuidParam.safeParse(id).success) notFound();
  const { supabase, prefs } = await requirePageSession();
  const { data: activity } = await getActivity(supabase, id);
  if (!activity) notFound();
  const { data: day } = await listActivities(supabase, { from: activity.date, to: activity.date });
  const printed = sp.printed === "1";

  return (
    <main className="relative mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-10">
      {printed ? (
        <h1 className="font-display text-[44px] leading-[0.95] font-extrabold tracking-tight text-white">
          Printed.
          <br />
          Keep the receipt.
        </h1>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs font-semibold tracking-[0.06em] text-white">
            <BackButton />
            <span>RECEIPT</span>
          </div>
          <h1 className="mt-2.5 font-display text-[40px] leading-[0.95] font-extrabold tracking-tight text-white">
            Your {TYPE_LABEL[activity.type].toLowerCase()},
            <br />
            itemised
          </h1>
        </>
      )}

      <div className="relative mt-5">
        <div className="relative z-10 h-[22px] rounded-[11px] bg-ink shadow-[0_4px_0_#14306F]">
          <span className="absolute inset-x-[30px] top-[9px] h-1 rounded-sm bg-black" />
        </div>
        <div className={`mx-[30px] -mt-[11px] origin-top ${printed ? "rotate-[1.5deg]" : ""}`}>
          <Receipt activity={activity} day={day ?? [activity]} units={prefs.units} fresh={printed} />
          <ZigZag />
        </div>
        {printed ? (
          <div
            aria-hidden="true"
            className="absolute -right-1 -bottom-16 flex size-[120px] rotate-[-18deg] items-center justify-center rounded-full border-4 border-red bg-paper/15 text-center text-[15px] leading-[1.15] font-extrabold text-red"
          >
            PAID
            <br />
            IN
            <br />
            SWEAT
          </div>
        ) : null}
      </div>

      <div className={`${printed ? "mt-20" : "mt-8"} flex flex-col gap-2.5`}>
        {printed ? (
          <>
            <Link href="/day" className={bigButton}>
              SEE TODAY&apos;S LEDGER
            </Link>
            <Link href="/" className={outlineButton}>
              BACK HOME
            </Link>
          </>
        ) : (
          <>
            <Link href={`/activities/${activity.id}/edit`} className={bigButton}>
              EDIT ORDER
            </Link>
            <VoidButton id={activity.id} label={TYPE_LABEL[activity.type]} className={outlineButton} />
          </>
        )}
        {printed ? (
          <Link href={`/activities/${activity.id}/edit`} className="py-2 text-center text-xs font-extrabold text-white underline underline-offset-4">
            SOMETHING WRONG? EDIT IT
          </Link>
        ) : null}
      </div>
    </main>
  );
}

export default function ActivityPage(props: PageProps<"/activities/[id]">) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-xl px-5 pt-14" aria-busy="true">
          <div className="mt-24 h-[420px] animate-pulse bg-paper/40" />
        </main>
      }
    >
      <ReceiptScreen params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
