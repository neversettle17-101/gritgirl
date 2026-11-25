import type { CSSProperties } from "react";
import type { CyclePhase } from "@/lib/domain/cycle";

/**
 * Phase swatches from the brand palette. Phase is never shown by colour
 * alone: every swatch also carries its letter code (M/F/O/L), and predicted
 * days are hatched with a dashed edge.
 */
export const PHASE_COLOR: Record<CyclePhase, { bg: string; fg: string }> = {
  menstrual: { bg: "#e0412b", fg: "#ffffff" },
  follicular: { bg: "#ffe27a", fg: "#1b1b1b" },
  ovulatory: { bg: "#2b59c3", fg: "#ffffff" },
  luteal: { bg: "#1b1b1b", fg: "#ffffff" },
};

const PAPER = "#fffdf8";

/** Background + border for one day cell. */
export function phaseCellStyle(phase: CyclePhase | null, predicted: boolean): CSSProperties {
  if (!phase) {
    return { background: PAPER, color: "#555555", border: "1px dotted #999999" };
  }
  const { bg, fg } = PHASE_COLOR[phase];
  if (!predicted) return { background: bg, color: fg, border: `1px solid ${bg}` };
  return {
    background: `repeating-linear-gradient(135deg, ${bg} 0 2px, ${PAPER} 2px 5px)`,
    color: "#1b1b1b",
    border: `1px dashed ${phase === "follicular" ? "#1b1b1b" : bg}`,
  };
}
