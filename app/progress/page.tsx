import Link from "next/link";
import { Suspense } from "react";
import { TrendMark } from "@/components/progress/trend-mark";
import { BackButton } from "@/components/ui";
import { requirePageSession } from "@/lib/activities/page-data";
import { formatReceiptDate } from "@/lib/domain/dates";
import {
  buildExerciseProgress,
  formatPrimary,
  formatPrimaryChange,
  KIND_LABELS,
} from "@/lib/domain/progress";
import { listExerciseHistories } from "@/lib/progress/repo";

/** Where the back button goes: the screen that linked here (Profile or Regulars), else Home. */
const BACK: Record<string, { href: string; label: string }> = {
  profile: { href: "/profile", label: "Back to profile" },
  regulars: { href: "/regulars", label: "Back to regulars" },
};

function Header({ from }: { from?: string }) {
  const back = (from && Object.hasOwn(BACK, from) ? BACK[from] : undefined) ?? { href: "/", label: "Back to home" };
  return (
    <>
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.06em] text-white">
        <BackButton href={back.href} label={back.label} />
        <span>PROGRESS</span>
      </div>
      <h1 className="mt-2.5 font-display text-[40px] leading-[0.95] font-extrabold tracking-tight text-white">
        Your progress
      </h1>
      <p className="mt-1.5 text-xs text-[#E3E9FA]">Every lift you have logged, latest week vs the week before.</p>
    </>
  );
}

async function ProgressList() {
  const { supabase, prefs } = await requirePageSession();
  const { data, error } = await listExerciseHistories(supabase);
  if (error) {
    return (
      <p role="alert" className="mt-4 bg-paper p-3 text-xs font-extrabold text-red">
        Could not load your progress. Try again.
      </p>
    );
  }
  const unit = prefs.units.weight;
  const items = data.map((h) => buildExerciseProgress(h, { weekStartsOn: prefs.weekStartsOn, timezone: prefs.timezone }));

  if (items.length === 0) {
    return (
      <div className="mt-4 bg-paper p-3 text-xs leading-relaxed text-ink">
        <p>No strength logged yet. Log a workout (or ring up a regular) this week and again next week to see your lifts move.</p>
        <Link href="/log/strength" className="mt-2 inline-block font-extrabold underline underline-offset-2">
          LOG A STRENGTH WORKOUT
        </Link>
      </div>
    );
  }

  return (
    <ul aria-label="Exercises" className="mt-4 flex flex-col bg-paper px-3.5 py-1.5 text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
      {items.map((p) => {
        const last = p.weeks[p.weeks.length - 1]!;
        return (
          <li key={p.exerciseId} className="border-b border-dotted border-rule last:border-b-0">
            <Link
              href={`/progress/${p.exerciseId}`}
              aria-label={`Progress for ${p.name}`}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 py-2.5 hover:text-blue"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-extrabold uppercase">{p.name}</span>
                <span className="block text-[10px] text-muted">
                  {KIND_LABELS[p.kind].primary} {formatPrimary(last, p.kind, unit)}
                  {p.lastDone ? ` · LAST ${formatReceiptDate(p.lastDone)}` : ""}
                </span>
              </span>
              <span className="text-right text-[11px]" data-testid="trend">
                {p.trend && last.change ? (
                  <>
                    <TrendMark trend={p.trend} /> {formatPrimaryChange(last.change.primary, p.kind, unit)}
                  </>
                ) : (
                  <span className="text-muted">1 WEEK</span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Progress overview: every strength exercise I have logged, with a trend vs the previous week. */
export default function ProgressPage({ searchParams }: PageProps<"/progress">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-12">
      <Suspense fallback={<Header />}>
        <FromHeader searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div aria-busy="true" className="mt-4 h-60 animate-pulse bg-paper/40" />}>
        <ProgressList />
      </Suspense>
    </main>
  );
}

async function FromHeader({ searchParams }: { searchParams: PageProps<"/progress">["searchParams"] }) {
  const sp = await searchParams;
  return <Header from={typeof sp.from === "string" ? sp.from : undefined} />;
}
