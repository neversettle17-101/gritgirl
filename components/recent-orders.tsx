"use client";

import Link from "next/link";
import { TypeBadge } from "@/components/ui";
import { useUndoDelete } from "@/components/undo-delete";
import { effectiveDurationSec, TYPE_LABEL, type ActivityDetail } from "@/lib/domain/activity-types";
import { formatReceiptDate } from "@/lib/domain/dates";
import { formatDistance, formatMinutes, type Units } from "@/lib/domain/units";

/** The last two weeks of logs, so any activity can be opened, edited or voided. */
export function RecentOrders({ activities, units, today }: { activities: ActivityDetail[]; units: Units; today: string }) {
  const { hidden } = useUndoDelete();
  const shown = activities.filter((a) => !hidden.has(a.id));

  if (shown.length === 0) {
    return (
      <p className="mt-2 bg-paper px-3 py-4 text-xs text-ink">
        Nothing rung up in the last two weeks. Order something fresh above.
      </p>
    );
  }

  return (
    <ul className="mt-2 bg-paper px-3 py-1 text-ink">
      {shown.map((a, i) => {
        const detail =
          a.type === "strength"
            ? `${a.exercises.length} ${a.exercises.length === 1 ? "ITEM" : "ITEMS"}`
            : a.distanceM
              ? `${formatDistance(a.distanceM, units.distance)} ${units.distance.toUpperCase()}`
              : "";
        return (
          <li key={a.id} className={i < shown.length - 1 ? "border-b border-dotted border-rule" : ""}>
            <Link
              href={`/activities/${a.id}`}
              className="grid grid-cols-[30px_1fr_auto] items-center gap-2 py-2.5 hover:text-blue"
            >
              <TypeBadge type={a.type} />
              <span className="flex flex-col">
                <span className="text-[13px] font-extrabold">
                  {TYPE_LABEL[a.type]} {detail}
                </span>
                <span className="text-[11px] text-muted">
                  {a.date === today ? "TODAY" : formatReceiptDate(a.date)}
                  {a.startTime ? ` · ${a.startTime}` : ""}
                </span>
              </span>
              <span className="text-xs font-extrabold">{formatMinutes(effectiveDurationSec(a))}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
