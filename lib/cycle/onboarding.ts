import { safeNextPath } from "@/lib/auth/safe-next";

/**
 * Onboarding redirect rules (PRD CYC-3, SET-1).
 *
 * Every account gets a user_settings row at sign-up (handle_new_user), so
 * "onboarded" means the onboarding form was submitted (onboarded_at set),
 * not that a row exists. A missing row is treated as "not onboarded" too.
 */

export const ONBOARDING_PATH = "/onboarding";

/** Paths that must stay reachable before onboarding is complete. */
const EXEMPT = [ONBOARDING_PATH, "/sign-in", "/auth", "/api"];

function isExempt(pathname: string): boolean {
  return EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** `/onboarding?next=…` for a page the user was trying to reach. */
export function onboardingUrl(next: string): string {
  const target = safeNextPath(next);
  if (target === "/" || isExempt(target.split("?")[0]!)) return ONBOARDING_PATH;
  return `${ONBOARDING_PATH}?next=${encodeURIComponent(target)}`;
}

/**
 * Where a signed-in user asking for `path` should be sent instead, or null to
 * let them through. Only users who have not finished onboarding are redirected.
 */
export function onboardingRedirect(
  settings: { onboarded: boolean } | null,
  path: string,
): string | null {
  if (settings?.onboarded) return null;
  const pathname = safeNextPath(path).split("?")[0]!;
  if (isExempt(pathname)) return null;
  return onboardingUrl(path);
}

/** Where to go after onboarding (or when an onboarded user opens /onboarding). */
export function afterOnboardingPath(next: string | null | undefined): string {
  const target = safeNextPath(next);
  return isExempt(target.split("?")[0]!) ? "/" : target;
}
