import Link from "next/link";
import { TypeBadge } from "@/components/ui";
import { requirePageSession } from "@/lib/activities/page-data";
import { ringUpHref, templateTagline } from "@/lib/domain/templates";
import { listTemplates } from "@/lib/templates/repo";

/** How many regulars the home strip shows; the rest are one tap away. */
const SHOWN = 6;

/**
 * Home "THE USUAL?" (mockup 0-home): my most-used regulars as a horizontal
 * strip of cards. One tap rings it up: opens the right slip, pre-filled.
 * Reads cookies, so render inside <Suspense>.
 */
export async function TheUsual() {
  const { supabase, prefs } = await requirePageSession();
  const { data } = await listTemplates(supabase);
  const regulars = (data ?? []).slice(0, SHOWN);

  if (regulars.length === 0) {
    return (
      <div className="mt-1 border-2 border-dashed border-paper/70 p-3 text-xs leading-relaxed text-white">
        No regulars yet. Tick <strong>SAVE AS A NEW REGULAR</strong> on any slip, or{" "}
        <Link href="/regulars/new" className="font-extrabold underline underline-offset-2">
          set one up
        </Link>
        , and it rings up here in one tap.
      </div>
    );
  }

  return (
    <ul aria-label="Your regulars" className="-mx-5 mt-1 flex gap-2.5 overflow-x-auto px-5 pb-2">
      {regulars.map((t) => (
        <li key={t.id} className="flex-[0_0_150px]">
          <Link
            href={ringUpHref(t)}
            aria-label={`Ring up ${t.name}`}
            className="flex h-full flex-col gap-1.5 bg-paper p-3 text-ink hover:text-blue"
          >
            <span className="flex items-center justify-between">
              <TypeBadge type={t.type} size={22} />
              <span className="text-[10px] text-muted">USED {t.usedCount}×</span>
            </span>
            <span className="font-display text-xl leading-none font-extrabold break-words">{t.name}</span>
            <span className="text-[11px] text-muted">{templateTagline(t, prefs.units)}</span>
            <span className="mt-auto border-t border-dashed border-ink pt-1.5 text-[11px] font-extrabold">
              RING IT UP →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
