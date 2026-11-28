import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BloodDrop } from "@/components/cycle/marks";
import { ProgressChart } from "@/components/progress/progress-chart";
import { TrendMark } from "@/components/progress/trend-mark";
import { BackButton, Dashed } from "@/components/ui";
import { requirePageSession } from "@/lib/activities/page-data";
import { loadPeriodMarks } from "@/lib/cycle/repo";
import { formatReceiptDate } from "@/lib/domain/dates";
import {
  buildExerciseProgress,
  chartPoint,
  formatPrimary,
  formatPrimaryChange,
  formatSecondary,
  formatSecondaryChange,
  KIND_LABELS,
  weekLabel,
  type ExerciseProgress,
} from "@/lib/domain/progress";
import { periodCaption, periodWeeks, sessionRange, type PeriodWeeks } from "@/lib/domain/progress-periods";
import type { WeightUnit } from "@/lib/domain/units";
import { getExerciseHistory, getExerciseName } from "@/lib/progress/repo";
import { uuidParam } from "@/lib/validation/activities";

const plural = (n: number, one: string, many = `${one}S`) => `${n} ${n === 1 ? one : many}`;

function Header({ name }: { name?: string }) {
  return (
    <>
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.06em] text-white">
        <BackButton href="/progress" label="Back to progress" />
        <span>PROGRESS</span>
      </div>
      <h1 className="mt-2.5 font-display text-[36px] leading-[0.95] font-extrabold tracking-tight break-words text-white">
        {name ?? " "}
      </h1>
    </>
  );
}

function Summary({ p, unit }: { p: ExerciseProgress; unit: WeightUnit }) {
  const first = p.weeks[0]!;
  const last = p.weeks[p.weeks.length - 1]!;
  const labels = KIND_LABELS[p.kind];
  return (
    <section aria-label="Summary" className="mt-4 bg-paper px-4 py-3.5 text-xs leading-[1.7] text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
      <div className="flex justify-between gap-3">
        <span>LATEST {labels.primary}</span>
        <strong data-testid="latest-primary">{formatPrimary(last, p.kind, unit)}</strong>
      </div>
      <div className="flex justify-between gap-3">
        <span>LATEST {labels.secondary}</span>
        <strong>{formatSecondary(last, p.kind, unit)}</strong>
      </div>
      <div className="flex justify-between gap-3">
        <span>LAST DONE</span>
        <strong>{p.lastDone ? formatReceiptDate(p.lastDone) : "—"}</strong>
      </div>
      {p.overall ? (
        <>
          <Dashed className="my-2" />
          <div className="flex items-center justify-between gap-3 font-extrabold" data-testid="overall-change">
            <span>SINCE {formatReceiptDate(first.weekStart).slice(4)}</span>
            <span className="text-right">
              {formatPrimaryChange(p.overall.primary, p.kind, unit)} · {formatSecondaryChange(p.overall.secondary, p.kind, unit)}{" "}
              {p.kind === "weighted" ? "VOL" : ""}
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}

function OneWeek() {
  return (
    <p role="status" className="mt-4 border-2 border-dashed border-paper/70 p-3 text-xs leading-relaxed text-white">
      One week on the books. <strong>Log it again next week to see progress</strong>: the change week by week shows up
      here.
    </p>
  );
}

/** Under the chart: the exact period dates that hit sessions, and why those dips are circled (CycProgress). */
function PeriodNotes({ caption }: { caption: string }) {
  return (
    <div className="mt-2 border-t-2 border-dashed border-ink pt-2" data-testid="period-notes">
      <p className="text-[10px] font-extrabold tracking-[0.04em] text-blood">{caption}</p>
      <p className="mt-1.5 flex items-start gap-2 text-[11px] leading-[1.45] text-blood-ink">
        <BloodDrop width={14} className="mt-px" />
        <span>DIPS INSIDE A RED CIRCLE DON&apos;T COUNT AGAINST YOU. BLOOD BANK WAS CLOSED FOR REPAIRS.</span>
      </p>
    </div>
  );
}

function WeekTable({ p, unit, periods }: { p: ExerciseProgress; unit: WeightUnit; periods: PeriodWeeks }) {
  const labels = KIND_LABELS[p.kind];
  const rows = [...p.weeks].reverse();
  return (
    <div className="mt-4 bg-paper px-3 py-3 text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
      <table className="w-full table-fixed border-collapse text-[11px]" aria-label="Week by week">
        <thead>
          <tr className="border-b-2 border-dashed border-ink text-left text-[10px] text-muted">
            <th scope="col" className="w-[36%] pb-1 font-extrabold">
              WEEK
            </th>
            <th scope="col" className="pb-1 font-extrabold">
              {labels.primary}
            </th>
            <th scope="col" className="pb-1 text-right font-extrabold">
              {labels.secondary}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.weekStart} className="border-b border-dotted border-rule align-top" data-testid="week-row">
              <th scope="row" className="py-1.5 pr-1 text-left font-normal">
                <span className="flex items-center gap-1 font-extrabold">
                  {weekLabel(w.weekStart, w.weekEnd, p.thisWeekStart)}
                  {periods.has(w.weekStart) ? (
                    <>
                      <BloodDrop width={8} />
                      <span className="sr-only">(period day)</span>
                    </>
                  ) : null}
                </span>
                <span className="block text-[10px] text-muted">
                  {plural(w.sessions, "SESSION")} · {plural(w.sets, "SET")}
                  {w.reps ? ` · ${plural(w.reps, "REP")}` : ""}
                </span>
              </th>
              <td className="py-1.5 pr-1">
                <span className="block font-extrabold">{formatPrimary(w, p.kind, unit)}</span>
                {w.change ? (
                  <span className="block text-[10px]">
                    <TrendMark trend={w.trend!} /> {formatPrimaryChange(w.change.primary, p.kind, unit)}
                  </span>
                ) : (
                  <span className="block text-[10px] text-muted">FIRST WEEK</span>
                )}
              </td>
              <td className="py-1.5 text-right">
                <span className="block font-extrabold">{formatSecondary(w, p.kind, unit)}</span>
                {w.change ? (
                  <span className="block text-[10px]">{formatSecondaryChange(w.change.secondary, p.kind, unit)}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] leading-snug text-muted">
        Change is against the previous week you logged.{" "}
        {p.kind === "weighted" ? "Volume = reps × weight, summed over the week." : null}
      </p>
    </div>
  );
}

async function ProgressBody({ params }: { params: PageProps<"/progress/[exerciseId]">["params"] }) {
  const { exerciseId } = await params;
  if (!uuidParam.safeParse(exerciseId).success) notFound();
  const { supabase, prefs } = await requirePageSession();
  const { data: history, error } = await getExerciseHistory(supabase, exerciseId);
  if (error) throw new Error("Could not load your progress");
  const unit = prefs.units.weight;

  if (!history) {
    const name = await getExerciseName(supabase, exerciseId);
    if (!name) notFound();
    return (
      <>
        <Header name={name} />
        <p role="status" className="mt-4 bg-paper p-3 text-xs leading-relaxed text-ink">
          Nothing logged for this one yet. Log it in a strength workout, then again next week, and the week-by-week
          change shows up here.
        </p>
        <Link
          href="/log/strength"
          className="mt-4 flex h-[54px] items-center justify-center bg-ink text-sm font-extrabold tracking-[0.04em] text-white"
        >
          LOG A STRENGTH WORKOUT
        </Link>
      </>
    );
  }

  const p = buildExerciseProgress(history, { weekStartsOn: prefs.weekStartsOn, timezone: prefs.timezone });
  // Period days are decoration here: if they don't load, the chart still does, just uncircled.
  const range = sessionRange(history.sessions);
  const marks = range ? await loadPeriodMarks(supabase, range, "progress") : null;
  const periods = periodWeeks(history.sessions, marks?.data ?? [], prefs.weekStartsOn);
  const caption = periodCaption(periods);
  const labels = KIND_LABELS[p.kind];
  const unitLabel = unit.toUpperCase();
  const primaryTitle =
    p.kind === "weighted" ? `${labels.primary} (${unitLabel})` : p.kind === "timed" ? `${labels.primary} (SEC)` : `${labels.primary} (REPS)`;
  const secondaryTitle =
    p.kind === "weighted" ? `${labels.secondary} (${unitLabel})` : p.kind === "timed" ? `${labels.secondary} (MIN)` : labels.secondary;
  const last = p.weeks[p.weeks.length - 1]!;

  return (
    <>
      <Header name={history.name} />
      <p className="mt-1.5 text-xs text-[#E3E9FA]">
        Week by week, weeks starting{" "}
        {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][prefs.weekStartsOn]}.
      </p>
      <Summary p={p} unit={unit} />
      {p.weeks.length < 2 ? (
        <OneWeek />
      ) : (
        <div className="mt-4 bg-paper px-3 pt-3 pb-2 text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
          <ProgressChart
            points={p.weeks.map((w) => ({ ...chartPoint(w, p.kind, unit), period: periods.has(w.weekStart) }))}
            primaryTitle={primaryTitle}
            secondaryTitle={secondaryTitle}
            summary={`${history.name}: ${labels.primary.toLowerCase()} ${formatPrimary(last, p.kind, unit)} in the latest week, over ${p.weeks.length} logged weeks${caption ? `. Weeks with a session on a period day are circled.` : ""}`}
          />
          {caption ? <PeriodNotes caption={caption} /> : null}
        </div>
      )}
      <WeekTable p={p} unit={unit} periods={periods} />
    </>
  );
}

/** One exercise's progress, week by week (top set, volume, reps, sessions). */
export default function ExerciseProgressPage({ params }: PageProps<"/progress/[exerciseId]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-12">
      <Suspense
        fallback={
          <>
            <Header />
            <div aria-busy="true" className="mt-4 h-80 animate-pulse bg-paper/40" />
          </>
        }
      >
        <ProgressBody params={params} />
      </Suspense>
    </main>
  );
}
