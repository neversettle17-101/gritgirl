import Link from "next/link";
import type { ReactNode } from "react";

/** Page frame shared by the Day / Week / Month ledgers (mockups 2, 3, 4). */
export function LedgerPage({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-32">{children}</main>;
}

const stepClass =
  "flex h-11 items-center px-1 text-xs font-extrabold tracking-[0.06em] text-white hover:text-yellow focus-visible:ring-2 focus-visible:ring-yellow";

/**
 * White eyebrow line, big heading, and the ‹ previous / next › links.
 * `next` is null when the next period has not started yet.
 */
export function LedgerHeader({
  left,
  right,
  title,
  prev,
  next,
}: {
  left: ReactNode;
  right: ReactNode;
  title: ReactNode;
  prev: { href: string; label: string };
  next: { href: string; label: string } | null;
}) {
  return (
    <>
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.06em] text-white">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <h1 className="mt-2.5 font-display text-[44px] leading-[0.95] font-extrabold tracking-tight text-white">
        {title}
      </h1>
      <nav aria-label="Ledger pages" className="mt-2 flex justify-between">
        <Link href={prev.href} className={stepClass} aria-label={prev.label}>
          ‹ PREV
        </Link>
        {next ? (
          <Link href={next.href} className={stepClass} aria-label={next.label}>
            NEXT ›
          </Link>
        ) : (
          <span aria-hidden="true" className={`${stepClass} opacity-40`}>
            NEXT ›
          </span>
        )}
      </nav>
    </>
  );
}

/** Loading state while the ledger is read. */
export function LedgerSkeleton() {
  return (
    <LedgerPage>
      <div aria-busy="true" className="mt-28 h-[420px] animate-pulse bg-paper/40" />
    </LedgerPage>
  );
}

/** Torn edge at the bottom of a receipt card. */
export function TornEdge() {
  return (
    <svg viewBox="0 0 350 12" preserveAspectRatio="none" aria-hidden="true" className="block h-3 w-full">
      <path
        d="M0 0 H350 L340 12 L330 0 L320 12 L310 0 L300 12 L290 0 L280 12 L270 0 L260 12 L250 0 L240 12 L230 0 L220 12 L210 0 L200 12 L190 0 L180 12 L170 0 L160 12 L150 0 L140 12 L130 0 L120 12 L110 0 L100 12 L90 0 L80 12 L70 0 L60 12 L50 0 L40 12 L30 0 L20 12 L10 0 L0 12 Z"
        fill="#FFFDF8"
      />
    </svg>
  );
}

/** Which activity types a day has, in R / S / W order, for labels and markers. */
export const TYPE_ORDER = ["running", "strength", "walking"] as const;
