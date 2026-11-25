"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

/**
 * Bottom bar: HOME on the left, PROFILE on the right, and a ledger button in
 * the middle that pops up DAY · MONTH · YEAR. The Week statement is still
 * reachable from the Day and Month ledgers and the home cards.
 *
 * Uses usePathname, so render <BottomNav> inside <Suspense> (Cache
 * Components); <NavBar> without a pathname is the static fallback.
 */
export const LEDGER_ITEMS = [
  { href: "/day", label: "DAY", hint: "RECEIPT" },
  { href: "/month", label: "MONTH", hint: "LEDGER" },
  { href: "/year", label: "YEAR", hint: "REPORT" },
] as const;

/** Ledger routes that light up the centre button (Week included, though it is not in the pop-up). */
const LEDGER_PATHS = ["/day", "/week", "/month", "/year"];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function isLedgerPath(pathname: string) {
  return LEDGER_PATHS.some((p) => isActive(pathname, p));
}

export function BottomNav() {
  const pathname = usePathname();
  return <NavBar pathname={pathname} />;
}

const sideLink =
  "flex min-h-14 flex-col items-center justify-center gap-1 px-4 text-[11px] font-extrabold tracking-[0.08em] text-white hover:text-yellow focus-visible:ring-2 focus-visible:ring-yellow";

export function NavBar({ pathname }: { pathname?: string }) {
  // Open only for the page it was opened on: any navigation closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = pathname !== undefined && openAt === pathname;
  const close = () => setOpenAt(null);

  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    // Move focus into the pop-up (the current ledger, else the first one).
    const current = LEDGER_ITEMS.findIndex((i) => pathname && isActive(pathname, i.href));
    itemRefs.current[Math.max(0, current)]?.focus();

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpenAt(null);
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenAt(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, pathname]);

  // Arrow keys move between the three options.
  function onItemsKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const edge = { Home: 0, End: LEDGER_ITEMS.length - 1 }[e.key];
    if (step === undefined && edge === undefined) return;
    e.preventDefault();
    const at = itemRefs.current.findIndex((el) => el === document.activeElement);
    const n = LEDGER_ITEMS.length;
    const to = edge ?? (at + step! + n) % n;
    itemRefs.current[to]?.focus();
  }

  const onLedger = pathname ? isLedgerPath(pathname) : false;
  const homeActive = pathname ? isActive(pathname, "/") : false;
  const profileActive = pathname ? isActive(pathname, "/profile") : false;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 bg-blue pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_rgba(255,255,255,0.25)]"
    >
      <div className="mx-auto grid w-full max-w-xl grid-cols-[1fr_auto_1fr] items-end px-3 pt-1 pb-1">
        <Link
          href="/"
          aria-current={homeActive ? "page" : undefined}
          className={`${sideLink} justify-self-start ${homeActive ? "underline decoration-[3px] underline-offset-[5px]" : ""}`}
        >
          <HomeIcon />
          HOME
        </Link>

        <div ref={wrapRef} className="relative flex flex-col items-center">
          <ul
            id={menuId}
            hidden={!open}
            aria-label="Ledgers"
            onKeyDown={onItemsKeyDown}
            className="absolute bottom-full left-1/2 mb-3 w-[min(19rem,calc(100vw-2rem))] -translate-x-1/2 grid-cols-3 border-2 border-ink bg-paper text-ink shadow-[0_12px_30px_rgba(0,0,0,0.3)] [&:not([hidden])]:grid"
          >
            {LEDGER_ITEMS.map((item, i) => {
              const active = pathname ? isActive(pathname, item.href) : false;
              return (
                <li key={item.href} className={i ? "border-l-2 border-dashed border-ink" : ""}>
                  <Link
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    href={item.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 py-2 hover:bg-yellow focus-visible:bg-yellow focus-visible:outline-none ${
                      active ? "bg-yellow" : ""
                    }`}
                  >
                    <span className="font-display text-lg leading-none font-extrabold">{item.label}</span>
                    <span aria-hidden="true" className="text-[9px] font-semibold tracking-[0.08em] text-muted">
                      {item.hint}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <button
            ref={buttonRef}
            type="button"
            aria-label="Ledgers"
            aria-expanded={open}
            aria-controls={menuId}
            disabled={pathname === undefined}
            onClick={() => setOpenAt(open ? null : (pathname ?? null))}
            className={`-mt-6 flex size-16 items-center justify-center rounded-full border-2 border-ink shadow-[0_6px_16px_rgba(0,0,0,0.3)] transition-transform focus-visible:ring-2 focus-visible:ring-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-blue ${
              open ? "rotate-12 bg-yellow" : onLedger ? "bg-yellow" : "bg-paper"
            }`}
          >
            <ReceiptIcon />
          </button>
          <span
            aria-hidden="true"
            className={`mt-0.5 mb-1 text-[10px] font-extrabold tracking-[0.08em] ${onLedger ? "text-yellow" : "text-white"}`}
          >
            LEDGERS
          </span>
        </div>

        <Link
          href="/profile"
          aria-current={profileActive ? "page" : undefined}
          className={`${sideLink} justify-self-end ${profileActive ? "underline decoration-[3px] underline-offset-[5px]" : ""}`}
        >
          <ProfileIcon />
          PROFILE
        </Link>
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

/** A till receipt with a torn bottom edge. */
function ReceiptIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 2h14v19l-2.33-1.5L14.33 21 12 19.5 9.67 21 7.33 19.5 5 21z"
        fill="#FFFDF8"
        stroke="#1B1B1B"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8.5 7h7M8.5 10.5h7M8.5 14h4" stroke="#1B1B1B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
