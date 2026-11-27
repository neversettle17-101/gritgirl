import { TREND_GLYPH, TREND_LABEL, type Trend } from "@/lib/domain/progress";

const COLOR: Record<Trend, string> = { up: "text-ink", flat: "text-muted", down: "text-red" };

/** ▲ / ■ / ▼ with the word for screen readers ("up", "level", "down"). */
export function TrendMark({ trend, withLabel = false }: { trend: Trend; withLabel?: boolean }) {
  return (
    <span className={`font-extrabold ${COLOR[trend]}`} data-trend={trend}>
      <span aria-hidden="true">{TREND_GLYPH[trend]}</span>
      {withLabel ? <span> {TREND_LABEL[trend]}</span> : <span className="sr-only">{TREND_LABEL[trend].toLowerCase()}</span>}
    </span>
  );
}
