import Link from "next/link";
import { TornEdge } from "@/components/ledger/ledger-shell";
import { FEEL_LABEL } from "@/components/ui";
import { effectiveDurationSec, TYPE_LABEL, type ActivityDetail } from "@/lib/domain/activity-types";
import { formatClock, formatDistance, formatMinutes, formatPace, formatWeight, type Units } from "@/lib/domain/units";

/**
 * "Today's receipt" (mockup 2): the day's activities in time order. Runs and
 * walks show distance, time, pace, heart rate, feel and comments; a strength
 * workout expands to its exercises and sets (reps · time · kg). Every item
 * links to the existing edit flow.
 */

const editLink = "shrink-0 text-[11px] font-extrabold text-blue underline underline-offset-2 hover:text-ink";

function feelText(a: ActivityDetail) {
  return a.feel ? `FELT ${FEEL_LABEL[a.feel]}` : null;
}

function ItemHead({ a }: { a: ActivityDetail }) {
  return (
    <span className="flex justify-between gap-2 font-extrabold">
      <span>
        {a.startTime ?? "--:--"} {TYPE_LABEL[a.type]}
      </span>
      <span>{formatMinutes(effectiveDurationSec(a))}</span>
    </span>
  );
}

function Notes({ notes }: { notes: string | null }) {
  return notes ? <p className="pl-12 text-[12px] break-words text-muted">“{notes}”</p> : null;
}

function CardioItem({ a, units }: { a: ActivityDetail; units: Units }) {
  const meta = [
    a.distanceM ? `${formatDistance(a.distanceM, units.distance)} ${units.distance.toUpperCase()}` : null,
    a.durationSec ? formatClock(a.durationSec) : null,
    a.distanceM && a.durationSec ? formatPace(a.durationSec, a.distanceM, units.distance).toUpperCase() : null,
    a.avgHeartRate ? `${a.avgHeartRate} BPM` : null,
    feelText(a),
  ].filter(Boolean);
  return (
    <>
      <ItemHead a={a} />
      <div className="flex items-start justify-between gap-2 pl-12">
        <span className="text-[12px] text-muted">{meta.join(" · ") || "NO DETAILS"}</span>
        <Link href={`/activities/${a.id}/edit`} className={editLink} aria-label={`Edit ${TYPE_LABEL[a.type].toLowerCase()}`}>
          EDIT
        </Link>
      </div>
      <Notes notes={a.notes} />
    </>
  );
}

function StrengthItem({ a, units }: { a: ActivityDetail; units: Units }) {
  const sets = a.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const meta = [
    `${a.exercises.length} ${a.exercises.length === 1 ? "EXERCISE" : "EXERCISES"}`,
    `${sets} ${sets === 1 ? "SET" : "SETS"}`,
    feelText(a),
  ].filter(Boolean);
  const weightCol = units.weight.toUpperCase();
  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <ItemHead a={a} />
        <span className="flex justify-between gap-2 pl-12 text-[12px] text-muted">
          <span>{meta.join(" · ")}</span>
          <span aria-hidden="true" className="font-extrabold text-ink group-open:hidden">
            +
          </span>
          <span aria-hidden="true" className="hidden font-extrabold text-ink group-open:inline">
            −
          </span>
        </span>
      </summary>
      <div className="mt-1 pl-4">
        {a.exercises.map((ex) => (
          <div key={ex.id} className="mt-1.5">
            <div className="truncate text-[12px] font-extrabold uppercase">{ex.exercise.name}</div>
            <table className="w-full text-[11px]">
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="w-10 text-left font-semibold">SET</th>
                  <th scope="col" className="text-right font-semibold">REPS</th>
                  <th scope="col" className="text-right font-semibold">TIME</th>
                  <th scope="col" className="text-right font-semibold">{weightCol}</th>
                </tr>
              </thead>
              <tbody>
                {ex.sets.map((s) => (
                  <tr key={s.setNumber}>
                    <td>{s.setNumber}</td>
                    <td className="text-right">{s.reps ?? "—"}</td>
                    <td className="text-right">{s.durationSec ? formatClock(s.durationSec) : "—"}</td>
                    <td className="text-right">{s.weightKg === null ? "—" : formatWeight(s.weightKg, units.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div className="mt-1.5 flex justify-end">
          <Link href={`/activities/${a.id}/edit`} className={editLink} aria-label="Edit strength">
            EDIT
          </Link>
        </div>
      </div>
      <Notes notes={a.notes} />
    </details>
  );
}

/** Decorative barcode, stable per date. */
function Barcode({ seed }: { seed: string }) {
  const digits = seed.replace(/\D/g, "");
  const bars = Array.from({ length: 40 }, (_, i) => (Number(digits[i % digits.length]) * (i + 3)) % 4 + 1);
  return (
    <div aria-hidden="true">
      <div className="mt-3.5 flex h-[34px] justify-center gap-[2px]">
        {bars.map((w, i) => (
          <span key={i} style={{ width: w }} className="bg-ink" />
        ))}
      </div>
      <div className="mt-1 text-center text-[10px] tracking-[0.3em]">{digits.slice(2)}</div>
    </div>
  );
}

export function DayReceipt({
  activities,
  minutes,
  streak,
  isToday,
  isFuture,
  units,
  date,
}: {
  activities: ActivityDetail[];
  minutes: number;
  /** current streak as of this day; 0 hides the line */
  streak: number;
  isToday: boolean;
  isFuture: boolean;
  units: Units;
  date: string;
}) {
  const empty = activities.length === 0;
  return (
    <div className="relative mt-5 -rotate-1">
      <div className="bg-paper px-[18px] pt-[18px] pb-3.5 text-[13px] leading-[1.55] text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
        <div className="text-center font-extrabold tracking-[0.08em]">GRIT GIRL</div>
        <div className="text-center text-[11px] text-muted">
          {isToday ? "thank you for moving today" : "thank you for moving"}
        </div>
        <div className="my-2.5 border-t-2 border-dashed border-ink" />

        {empty ? (
          <p className="text-muted">
            {isToday ? "NOTHING RUNG UP YET" : isFuture ? "NOT YET RUNG UP" : "REST DAY · NO CHARGE"}
          </p>
        ) : (
          <ul aria-label="Items">
            {activities.map((a, i) => (
              <li key={a.id} className={i ? "mt-2" : ""}>
                {a.type === "strength" ? <StrengthItem a={a} units={units} /> : <CardioItem a={a} units={units} />}
              </li>
            ))}
          </ul>
        )}

        <div className="my-2.5 border-t-2 border-dashed border-ink" />
        <div className="flex justify-between">
          <span>SUBTOTAL</span>
          <span>{minutes} MIN</span>
        </div>
        {streak > 0 ? (
          <div className="flex justify-between">
            <span>STREAK BONUS</span>
            <span>DAY {streak}</span>
          </div>
        ) : null}
        <div className="mt-1.5 flex justify-between text-lg font-extrabold">
          <span>TOTAL SWEAT</span>
          <span data-testid="day-total">{minutes} MIN</span>
        </div>
        <Barcode seed={`${date}${minutes}`} />
      </div>
      <TornEdge />
      {empty ? null : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-1 bottom-3 flex size-[80px] rotate-[-16deg] items-center justify-center rounded-full border-[3px] border-red text-center text-[11px] leading-[1.15] font-extrabold text-red opacity-80"
        >
          PAID
          <br />
          IN
          <br />
          SWEAT
        </div>
      )}
    </div>
  );
}
