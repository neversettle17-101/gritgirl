"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom navigation (mockup 0-home): HOME · DAY · WEEK · MONTH, plus CYCLE.
 * Uses usePathname, so render it inside <Suspense> (Cache Components).
 */
export const NAV_ITEMS = [
  { href: "/", label: "HOME" },
  { href: "/day", label: "DAY" },
  { href: "/week", label: "WEEK" },
  { href: "/month", label: "MONTH" },
  { href: "/cycle", label: "CYCLE" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} />;
}

/** Static fallback while the pathname is unknown (prerendered shell). */
export function NavLinks({ pathname }: { pathname?: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 bg-blue pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <ul className="mx-auto flex w-full max-w-xl justify-between px-3 text-[13px] font-extrabold tracking-[0.08em]">
        {NAV_ITEMS.map((item) => {
          const active = pathname ? isActive(pathname, item.href) : false;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block px-2 py-3 text-white hover:text-yellow ${
                  active ? "underline decoration-[3px] underline-offset-[6px]" : ""
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
