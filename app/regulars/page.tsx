import Link from "next/link";
import { Suspense } from "react";
import { BackButton, TypeBadge } from "@/components/ui";
import { requirePageSession } from "@/lib/activities/page-data";
import { formatReceiptDate } from "@/lib/domain/dates";
import { ringUpHref, templateLines } from "@/lib/domain/templates";
import { listTemplates } from "@/lib/templates/repo";

const newRegularClass =
  "mt-4 flex h-[54px] items-center justify-center border-[2.5px] border-dashed border-white text-sm font-extrabold tracking-[0.04em] text-white hover:text-yellow";

async function RegularsList() {
  const { supabase, prefs } = await requirePageSession();
  const { data, error } = await listTemplates(supabase);
  const regulars = data ?? [];

  return (
    <>
      <Header count={`${regulars.length} SAVED ${regulars.length === 1 ? "ORDER" : "ORDERS"}`} />
      {error ? (
        <p role="alert" className="mt-4 bg-paper p-3 text-xs font-extrabold text-red">
          Could not load your regulars. Pull to refresh or try again.
        </p>
      ) : null}
      {regulars.length === 0 && !error ? (
        <p className="mt-4 bg-paper p-3 text-xs leading-relaxed text-ink">
          No regulars yet. Set one up below, or tick <strong>SAVE AS A NEW REGULAR</strong> on any slip.
        </p>
      ) : null}
      <ul aria-label="Regulars" className="mt-4 flex flex-col gap-2.5">
        {regulars.map((t) => (
          <li key={t.id} className="bg-paper px-3.5 py-3 text-[11px] text-ink shadow-[0_8px_18px_rgba(0,0,0,0.18)]">
            <div className="flex items-center gap-2.5">
              <TypeBadge type={t.type} />
              <h2 className="flex-1 font-display text-[19px] leading-tight font-extrabold break-words">{t.name}</h2>
              <span className="text-right text-muted">
                USED {t.usedCount}×
                {t.lastUsedOn ? (
                  <>
                    <br />
                    LAST {formatReceiptDate(t.lastUsedOn)}
                  </>
                ) : null}
              </span>
            </div>
            <div aria-hidden="true" className="mt-2 mb-1.5 border-t border-dashed border-ink" />
            <dl>
              {templateLines(t, prefs.units).map((l, i) => (
                <div key={i} className="flex justify-between gap-3 leading-relaxed">
                  <dt className="truncate">{l.label}</dt>
                  <dd className="shrink-0">{l.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex gap-2">
              <Link
                href={ringUpHref(t)}
                aria-label={`Ring up ${t.name}`}
                className="flex h-10 flex-1 items-center justify-center bg-ink text-xs font-extrabold tracking-[0.04em] text-white hover:bg-blue"
              >
                RING IT UP
              </Link>
              <Link
                href={`/regulars/${t.id}/edit`}
                aria-label={`Edit ${t.name}`}
                className="flex h-10 w-[72px] items-center justify-center border-2 border-ink text-xs font-extrabold hover:text-blue"
              >
                EDIT
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Header({ count }: { count?: string }) {
  return (
    <>
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.06em] text-white">
        <BackButton />
        <span>{count}</span>
      </div>
      <h1 className="mt-2.5 font-display text-[40px] leading-[0.95] font-extrabold tracking-tight text-white">
        Your regulars
      </h1>
      <p className="mt-1.5 text-xs text-[#E3E9FA]">Saved workouts. One tap to ring up again.</p>
    </>
  );
}

/** Regulars (mockup 1): saved workouts, most used first. One tap to ring up again. */
export default function RegularsPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-12">
      <Suspense
        fallback={
          <>
            <Header />
            <div className="mt-4 h-60 animate-pulse bg-paper/40" />
          </>
        }
      >
        <RegularsList />
      </Suspense>
      <Link href="/regulars/new" className={newRegularClass}>
        + NEW REGULAR
      </Link>
    </main>
  );
}
