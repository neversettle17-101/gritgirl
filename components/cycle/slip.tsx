import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Receipt-style building blocks for the cycle, settings and onboarding
 * screens (mockup: blue page, tilted paper slips, dashed rules, torn edge).
 */

export function ScreenHeader({
  kicker,
  right,
  title,
  backHref,
}: {
  kicker?: ReactNode;
  right: ReactNode;
  title: ReactNode;
  backHref?: string;
}) {
  return (
    <header>
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.06em] text-paper">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back to home"
            className="flex size-11 items-center justify-center rounded-full bg-paper"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="#1b1b1b" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : (
          <span>{kicker}</span>
        )}
        <span>{right}</span>
      </div>
      <h1 className="mt-2.5 font-display text-[40px] leading-[0.95] font-extrabold tracking-tight text-paper">
        {title}
      </h1>
    </header>
  );
}

/** Zig-zag torn bottom edge of a receipt. */
export function TornEdge() {
  return (
    <svg width="100%" height="10" viewBox="0 0 350 10" preserveAspectRatio="none" aria-hidden="true" className="block">
      <path
        d="M0 0 H350 L340 10 L330 0 L320 10 L310 0 L300 10 L290 0 L280 10 L270 0 L260 10 L250 0 L240 10 L230 0 L220 10 L210 0 L200 10 L190 0 L180 10 L170 0 L160 10 L150 0 L140 10 L130 0 L120 10 L110 0 L100 10 L90 0 L80 10 L70 0 L60 10 L50 0 L40 10 L30 0 L20 10 L10 0 L0 10 Z"
        fill="#fffdf8"
      />
    </svg>
  );
}

export function Slip({
  children,
  tilt = 0,
  torn = false,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  /** Degrees; the mockup alternates roughly ±0.6. */
  tilt?: number;
  torn?: boolean;
  className?: string;
  as?: "section" | "div" | "form";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className="mt-4" style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined} {...rest}>
      <div className={`receipt p-4 text-xs shadow-[0_12px_30px_rgba(0,0,0,0.25)] ${className}`}>{children}</div>
      {torn ? <TornEdge /> : null}
    </Tag>
  );
}

export function Rule({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`my-3 border-t-2 border-dashed border-ink ${className}`} />;
}

export function Label({ children, htmlFor, id }: { children: ReactNode; htmlFor?: string; id?: string }) {
  return htmlFor ? (
    <label htmlFor={htmlFor} id={id} className="text-[11px] font-extrabold tracking-[0.04em] text-muted">
      {children}
    </label>
  ) : (
    <div id={id} className="text-[11px] font-extrabold tracking-[0.04em] text-muted">
      {children}
    </div>
  );
}

/** "LABEL ........ VALUE" receipt line. */
export function Line({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "text-sm font-extrabold" : ""}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export const DISCLAIMER =
  "Phases and predictions are calendar-based estimates, not medical advice.";
