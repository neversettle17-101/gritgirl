import Link from "next/link";
import { FEEL_LABEL } from "@/components/ui";
import { effectiveDurationSec, TYPE_LABEL, type ActivityDetail } from "@/lib/domain/activity-types";
import { formatReceiptDate } from "@/lib/domain/dates";
import { summarizeSets } from "@/lib/domain/strength-draft";
import { formatDistance, formatMinutes, formatPace, fromKg, type Units } from "@/lib/domain/units";

interface Props {
  activity: ActivityDetail;
  /** every activity logged that day, including this one */
  day: ActivityDetail[];
  units: Units;
  fresh: boolean;
}

function cardioDetail(a: ActivityDetail, units: Units): string[] {
  const parts: string[] = [];
  if (a.distanceM) {
    parts.push(`${formatDistance(a.distanceM, units.distance)} ${units.distance.toUpperCase()}`);
    parts.push(formatPace(a.durationSec, a.distanceM, units.distance).toUpperCase());
  }
  if (a.avgHeartRate) parts.push(`${a.avgHeartRate} BPM`);
  return parts;
}

/** The day's receipt with this activity highlighted (mockup 7). */
export function Receipt({ activity, day, units, fresh }: Props) {
  const total = day.reduce((s, a) => s + (effectiveDurationSec(a) ?? 0), 0);
  const ordered = [...day].sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99") || a.createdAt.localeCompare(b.createdAt));
  const receiptNo = activity.id.slice(0, 4).toUpperCase();

  return (
    <div className="bg-paper px-4 pt-6 pb-3.5 text-xs leading-[1.55] text-ink shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
      <div className="text-center font-extrabold tracking-[0.08em]">GRIT GIRL</div>
      <div className="text-center text-[11px] text-muted">
        {formatReceiptDate(activity.date)} · RECEIPT #{receiptNo}
      </div>
      <div className="my-2.5 border-t-2 border-dashed border-ink" />

      <ul aria-label="Today's items">
        {ordered.map((a) => {
          const mine = a.id === activity.id;
          const head = (
            <span className="flex justify-between gap-2">
              <span>
                {a.startTime ? `${a.startTime} ` : ""}
                {TYPE_LABEL[a.type]}
              </span>
              <span>{formatMinutes(effectiveDurationSec(a))}</span>
            </span>
          );
          if (!mine) {
            return (
              <li key={a.id} className="mt-1.5 text-muted">
                <Link href={`/activities/${a.id}`} className="block hover:text-blue">
                  {head}
                </Link>
              </li>
            );
          }
          const meta = [
            ...(a.type === "strength" ? [] : cardioDetail(a, units)),
            a.feel ? `FELT ${FEEL_LABEL[a.feel]}` : null,
            fresh ? "NEW" : null,
          ].filter(Boolean);
          return (
            <li key={a.id} className="mt-1.5" aria-current="true">
              <div className="-mx-1.5 bg-yellow px-1.5 py-1 font-extrabold">{head}</div>
              {meta.length ? <div className="pl-12 text-[11px] text-muted">{meta.join(" · ")}</div> : null}
              {a.type === "strength" ? (
                <ul className="mt-1 pl-4">
                  {a.exercises.map((ex) => {
                    const s = summarizeSets(
                      ex.sets.map((set) => ({
                        reps: set.reps,
                        durationSec: set.durationSec,
                        weight: set.weightKg === null ? null : fromKg(set.weightKg, units.weight),
                      })),
                      ex.exercise.tracking,
                    );
                    return (
                      <li key={ex.id} className="flex justify-between gap-2 text-[11px]">
                        <span className="truncate uppercase">{ex.exercise.name}</span>
                        <span className="shrink-0">
                          {s.line} · {s.weight === "BW" ? "BW" : `${s.weight} ${units.weight.toUpperCase()}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {a.notes ? <p className="mt-1 pl-4 text-[11px] break-words">“{a.notes}”</p> : null}
            </li>
          );
        })}
      </ul>

      <div className="my-2.5 border-t-2 border-dashed border-ink" />
      <div className="flex justify-between text-base font-extrabold">
        <span>TOTAL SWEAT</span>
        <span>{formatMinutes(total)}</span>
      </div>
      <div className="mt-2.5 text-center text-[11px]">*** COME BACK TOMORROW ***</div>
    </div>
  );
}

/** Torn-paper edge under the receipt. */
export function ZigZag() {
  return (
    <svg viewBox="0 0 290 12" preserveAspectRatio="none" aria-hidden="true" className="block h-3 w-full">
      <path
        d="M0 0 H290 L280 12 L270 0 L260 12 L250 0 L240 12 L230 0 L220 12 L210 0 L200 12 L190 0 L180 12 L170 0 L160 12 L150 0 L140 12 L130 0 L120 12 L110 0 L100 12 L90 0 L80 12 L70 0 L60 12 L50 0 L40 12 L30 0 L20 12 L10 0 L0 12 Z"
        fill="#FFFDF8"
      />
    </svg>
  );
}
