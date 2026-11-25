import type { PhaseBandDay } from "@/lib/domain/cycle-view";
import { PHASE_CODE, PHASE_LABEL } from "@/lib/domain/cycle-view";
import { phaseCellStyle } from "./phase-style";

export type { PhaseBandDay };

export interface PhaseBandProps {
  /** Days in display order (usually ascending). */
  days: readonly PhaseBandDay[];
  /** `YYYY-MM-DD` to mark as today, if it is in `days`. */
  today?: string;
  /** Print the M/F/O/L letter in each cell (default true). */
  showCodes?: boolean;
  /** Cell height in px (default 22). */
  height?: number;
  /** Accessible name for the whole band. */
  label?: string;
  className?: string;
}

function dayLabel(d: PhaseBandDay): string {
  const parts = [d.date];
  parts.push(d.phase ? `${PHASE_LABEL[d.phase]} (estimate)` : "phase unknown");
  if (d.isPeriod) parts.push("period logged");
  if (d.predicted) parts.push("predicted");
  return parts.join(", ");
}

/**
 * A strip of day cells coloured by cycle phase, the receipt-style "phase
 * band" used on the cycle slip and the Day / Week / Month ledgers.
 *
 * Logged period days are solid red with a dot; predicted days are hatched
 * with a dashed edge; unknown days are blank paper with a dotted edge.
 * Pure and hook-free, so it renders in Server and Client Components.
 */
export function PhaseBand({
  days,
  today,
  showCodes = true,
  height = 22,
  label = "Cycle phases (estimates)",
  className,
}: PhaseBandProps) {
  return (
    <ol
      aria-label={label}
      className={className}
      data-testid="phase-band"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))`,
        gap: 2,
        listStyle: "none",
        margin: 0,
        padding: 0,
      }}
    >
      {days.map((d) => {
        const isToday = d.date === today;
        return (
          <li
            key={d.date}
            title={dayLabel(d)}
            aria-label={`${dayLabel(d)}${isToday ? ", today" : ""}`}
            aria-current={isToday ? "date" : undefined}
            data-phase={d.phase ?? "unknown"}
            data-predicted={d.predicted || undefined}
            data-period={d.isPeriod || undefined}
            style={{
              ...phaseCellStyle(d.phase, d.predicted),
              position: "relative",
              height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              fontSize: 9,
              fontWeight: 800,
              lineHeight: 1,
              boxSizing: "border-box",
              outline: isToday ? "2px solid #1b1b1b" : undefined,
              outlineOffset: isToday ? 1 : undefined,
            }}
          >
            {showCodes ? (
              <span aria-hidden="true">{d.isPeriod ? "●" : d.phase ? PHASE_CODE[d.phase] : "·"}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Key for the band: one swatch per phase plus "predicted" and "logged period". */
export function PhaseLegend({ className }: { className?: string }) {
  const items = (["menstrual", "follicular", "ovulatory", "luteal"] as const).map((p) => ({
    key: p,
    style: phaseCellStyle(p, false),
    code: PHASE_CODE[p],
    text: PHASE_LABEL[p],
  }));
  return (
    <ul
      className={className}
      style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", listStyle: "none", margin: 0, padding: 0, fontSize: 10 }}
    >
      {items.map((i) => (
        <li key={i.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            aria-hidden="true"
            style={{ ...i.style, width: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, boxSizing: "border-box" }}
          >
            {i.code}
          </span>
          {i.text.toUpperCase()}
        </li>
      ))}
      <li style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span aria-hidden="true" style={{ ...phaseCellStyle("menstrual", false), width: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, boxSizing: "border-box" }}>
          ●
        </span>
        LOGGED
      </li>
      <li style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span aria-hidden="true" style={{ ...phaseCellStyle("menstrual", true), width: 14, height: 14, display: "inline-block", boxSizing: "border-box" }} />
        PREDICTED
      </li>
    </ul>
  );
}
