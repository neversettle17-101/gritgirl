"use client";

import Link from "next/link";
import { useState } from "react";
import { BloodDrop, PenCircle } from "@/components/cycle/marks";
import type { ActivityType } from "@/lib/domain/activity-types";

/**
 * The Month ledger's calendar grid and its caption line (mockup 4, CycMonth).
 * Each day links to its receipt; pointing at or focusing a day shows its
 * caption ("TUE 24 · BLOOD BANK DOWN (DAY 1) · STRENGTH + WALK"). A logged
 * period day gets the blood tint, the red pen loop and a drop by its markers.
 */
export interface MonthGridCell {
  date: string;
  /** false for the padding days before/after the month */
  inPeriod: boolean;
  n: number;
  types: ActivityType[];
  today: boolean;
  /** Day within a logged period (1-based), or null. */
  periodDay: number | null;
  ariaLabel: string;
  caption: string;
}

const MARKER: Record<ActivityType, { letter: string; className: string }> = {
  running: { letter: "R", className: "size-3 bg-ink text-white leading-3" },
  strength: { letter: "S", className: "size-3 bg-red text-white leading-3" },
  walking: { letter: "W", className: "size-3 border border-ink leading-[10px]" },
};

const DEFAULT_CAPTION = "TAP A DAY FOR ITS RECEIPT";

function Cell({ c, onPick }: { c: MonthGridCell; onPick: (date: string) => void }) {
  if (!c.inPeriod) return <span aria-hidden="true" className="h-11" />;
  const period = c.periodDay !== null;
  return (
    <Link
      href={`/day?date=${c.date}`}
      aria-label={c.ariaLabel}
      aria-current={c.today ? "date" : undefined}
      data-period-day={c.periodDay ?? undefined}
      onPointerEnter={() => onPick(c.date)}
      onFocus={() => onPick(c.date)}
      className={`relative flex h-11 flex-col items-center gap-[3px] pt-[3px] text-[11px] ${
        period ? "focus-visible:outline-2 focus-visible:outline-ink" : "hover:bg-yellow focus-visible:bg-yellow"
      } ${c.today ? "border-2 border-ink" : ""}`}
    >
      {period ? (
        <>
          <span aria-hidden="true" className="absolute inset-0 bg-blood-tint" />
          <PenCircle variant="round" />
        </>
      ) : null}
      <span className="relative font-semibold">{c.n}</span>
      <span aria-hidden="true" className="relative flex items-center gap-px">
        {c.types.map((t) => (
          <span key={t} className={`text-center text-[9px] font-extrabold ${MARKER[t].className}`}>
            {MARKER[t].letter}
          </span>
        ))}
        {period ? <BloodDrop /> : null}
      </span>
    </Link>
  );
}

export function MonthGrid({ cells }: { cells: MonthGridCell[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const picked = sel ? cells.find((c) => c.date === sel) : undefined;
  return (
    <>
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((c) => (
          <Cell key={c.date} c={c} onPick={setSel} />
        ))}
      </div>
      <div className="mt-2 mb-1.5 border-t-2 border-dashed border-ink" />
      <p className={`min-h-4 text-xs font-extrabold ${picked?.periodDay ? "text-blood" : ""}`} data-testid="month-caption">
        {picked?.caption ?? DEFAULT_CAPTION}
      </p>
    </>
  );
}
