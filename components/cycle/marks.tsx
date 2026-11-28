import type { CSSProperties } from "react";

/**
 * The shared "blood bank down" marks from the approved cycle screens
 * (CycProfile / CycProgress / CycWeek / CycMonth): a hand-drawn red pen
 * circle, a blood drop, and the tilted red tag. All decorative — callers put
 * the meaning in text or an aria-label ("period day 1").
 */

/** Pen-circle red. Recharts / SVG props need a literal colour. */
export const BLOOD = "#C8102E";

const SCRIBBLES = {
  /** Cells, chips and chart points (CycMonth / CycProfile / CycProgress). */
  round: "M14 52 C10 20 40 6 62 8 C88 12 98 34 92 64 C86 92 52 98 28 90 C8 82 4 56 22 30",
  /** Wide rows (CycWeek). */
  wide: "M6 54 C4 22 30 8 60 10 C88 12 99 30 96 58 C92 88 56 96 26 90 C6 86 1 64 12 34",
} as const;

/**
 * An open, slightly overshooting pen loop that stretches over its box.
 * Position it with `className` / `style` (it is `position: absolute`); by
 * default it spills `bleed` px past each edge of its positioned parent.
 */
export function PenCircle({
  variant = "round",
  bleed = 4,
  strokeWidth = 2.4,
  className = "",
  style,
}: {
  variant?: keyof typeof SCRIBBLES;
  bleed?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute overflow-visible ${className}`}
      style={{
        left: -bleed,
        top: -bleed,
        width: `calc(100% + ${bleed * 2}px)`,
        height: `calc(100% + ${bleed * 2}px)`,
        ...style,
      }}
    >
      <path
        d={SCRIBBLES[variant]}
        fill="none"
        stroke={BLOOD}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Raw path data for drawing the round pen loop inside another SVG (e.g. a Recharts dot). */
export const PEN_CIRCLE_PATH = SCRIBBLES.round;

/** A blood drop. `face` adds the little smiley used on the Cycle desk header. */
export function BloodDrop({ width = 9, face = false, className = "" }: { width?: number; face?: boolean; className?: string }) {
  return (
    <svg width={width} height={(width * 28) / 24} viewBox="0 0 24 28" aria-hidden="true" className={`flex-none ${className}`}>
      <path d="M12 1C9 7 4 11 4 17a8 8 0 0 0 16 0c0-6-5-10-8-16z" fill={BLOOD} />
      {face ? (
        <>
          <circle cx="9.5" cy="17" r="1.4" fill="#fff" />
          <circle cx="14.5" cy="17" r="1.4" fill="#fff" />
          <path d="M10 21q2 1.6 4 0" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  );
}

/** The tilted red "BLOOD BANK DOWN" tag (CycProgress). */
export function BloodBankTag({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block -rotate-6 whitespace-nowrap bg-blood px-[5px] py-[3px] text-[9px] font-extrabold tracking-[0.04em] text-white ${className}`}
      style={style}
    >
      BLOOD BANK DOWN
    </span>
  );
}

/** Inline red note: drop + "BLOOD BANK DOWN · DAY 1" (CycWeek rows). */
export function BloodBankNote({ day, className = "" }: { day: number; className?: string }) {
  return (
    <span className={`flex items-center gap-1 text-[10px] font-extrabold text-blood ${className}`}>
      <BloodDrop />
      BLOOD BANK DOWN · DAY {day}
    </span>
  );
}
