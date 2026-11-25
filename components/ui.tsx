import Link from "next/link";
import type { ReactNode } from "react";
import type { ActivityType } from "@/lib/domain/activity-types";
import { FEEL_LEVELS, type Feel } from "@/lib/validation/activities";

/** Shared receipt-style building blocks (mockup screens 0, 5, 6, 7). */

export const inputClass =
  "h-11 w-full border-2 border-ink bg-white px-2.5 font-mono text-base font-extrabold text-ink outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-1 aria-[invalid=true]:border-red";

export const labelClass = "text-xs font-extrabold tracking-[0.04em] text-muted";

export function Dashed({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`border-t-2 border-dashed border-ink ${className}`} />;
}

const BADGE: Record<ActivityType, { letter: string; className: string }> = {
  running: { letter: "R", className: "bg-ink text-white" },
  strength: { letter: "S", className: "bg-red text-white" },
  walking: { letter: "W", className: "border border-ink text-ink" },
};

export function TypeBadge({ type, size = 24 }: { type: ActivityType; size?: number }) {
  const b = BADGE[type];
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center text-xs font-extrabold ${b.className}`}
    >
      {b.letter}
    </span>
  );
}

export function BackButton({ href = "/", label = "Back to home" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full bg-paper focus-visible:ring-2 focus-visible:ring-yellow"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M15 5l-7 7 7 7"
          fill="none"
          stroke="#1B1B1B"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

/** Blue page with the white header line and big Bricolage heading. */
export function SlipHeader({ title, eyebrow = "ORDER SLIP", back }: { title: ReactNode; eyebrow?: string; back?: string }) {
  return (
    <>
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.06em] text-white">
        <BackButton href={back} />
        <span>{eyebrow}</span>
      </div>
      <h1 className="mt-2.5 font-display text-[40px] leading-[0.95] font-extrabold tracking-tight text-white">
        {title}
      </h1>
    </>
  );
}

export const FEEL_LABEL: Record<Feel, string> = {
  breezy: "BREEZY",
  easy: "EASY",
  solid: "SOLID",
  spicy: "SPICY",
  wrecked: "WRECKED",
};

/** "Spice level" — optional; tapping the chosen one again clears it. */
export function FeelPicker({ value, onChange }: { value: Feel | null; onChange: (f: Feel | null) => void }) {
  return (
    <fieldset>
      <legend className={labelClass}>SPICE LEVEL</legend>
      <div className="mt-1.5 flex flex-col">
        {FEEL_LEVELS.map((f) => {
          const on = value === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : f)}
              className="flex h-8 items-center gap-2.5 text-left text-[13px] text-ink"
            >
              <span className="flex size-4 items-center justify-center border-2 border-ink text-xs leading-none font-extrabold">
                {on ? "X" : ""}
              </span>
              <span className={on ? "font-extrabold" : ""}>{FEEL_LABEL[f]}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[11px] font-extrabold text-red">
      {message}
    </p>
  );
}

export function PrinterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The big ink button pinned to the bottom of a slip. */
export function PrintBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-blue via-blue/95 to-transparent px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </div>
  );
}

export const printButtonClass =
  "flex h-[58px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-ink text-[15px] font-extrabold tracking-[0.04em] text-white disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-yellow";

export const placeholderTag = "rounded-sm bg-yellow px-1 text-[9px] font-extrabold tracking-[0.08em] text-ink";
