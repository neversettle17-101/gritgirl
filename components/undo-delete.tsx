"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { deleteActivity } from "@/lib/client/api";

/**
 * Delete with undo (§6): the row disappears at once and a toast offers UNDO
 * for ~5 seconds. Only then is DELETE sent. Lives in the root layout so the
 * toast survives navigating from the receipt back home. If the tab is closed
 * during the window, the delete is flushed with fetch keepalive.
 */

export const UNDO_MS = 5000;

interface Pending {
  id: string;
  label: string;
  deadline: number;
}

interface UndoDeleteApi {
  /** ids hidden from lists because a delete is pending or done */
  hidden: ReadonlySet<string>;
  scheduleDelete: (id: string, label: string) => void;
}

const Ctx = createContext<UndoDeleteApi>({ hidden: new Set(), scheduleDelete: () => {} });

export const useUndoDelete = () => useContext(Ctx);

export function UndoDeleteProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending[]>([]);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingRef = useRef<Pending[]>([]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const commit = useCallback(
    async (id: string) => {
      timers.current.delete(id);
      setPending((p) => p.filter((x) => x.id !== id));
      setDone((d) => new Set(d).add(id));
      try {
        await deleteActivity(id);
        router.refresh();
      } catch {
        setDone((d) => {
          const next = new Set(d);
          next.delete(id);
          return next;
        });
        setError("Could not void that one. It is back on the list.");
      }
    },
    [router],
  );

  const scheduleDelete = useCallback(
    (id: string, label: string) => {
      setError(null);
      setPending((p) => [...p.filter((x) => x.id !== id), { id, label, deadline: Date.now() + UNDO_MS }]);
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => void commit(id), UNDO_MS),
      );
    },
    [commit],
  );

  const undo = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setPending((p) => p.filter((x) => x.id !== id));
  }, []);

  // Closing the tab mid-window still deletes, as the toast promised.
  useEffect(() => {
    const flush = () => {
      for (const p of pendingRef.current) void deleteActivity(p.id, true).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const hidden = useMemo(() => new Set([...done, ...pending.map((p) => p.id)]), [done, pending]);
  const api = useMemo(() => ({ hidden, scheduleDelete }), [hidden, scheduleDelete]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex flex-col items-center gap-2 px-5">
        {pending.map((p) => (
          <div
            key={p.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 bg-ink px-4 py-3 text-sm font-extrabold text-white shadow-lg"
          >
            <span>VOIDED {p.label}</span>
            <button
              type="button"
              onClick={() => undo(p.id)}
              className="px-2 py-1 text-yellow underline underline-offset-4"
            >
              UNDO
            </button>
          </div>
        ))}
        {error ? (
          <div role="alert" className="pointer-events-auto w-full max-w-md bg-red px-4 py-3 text-sm font-extrabold text-white">
            {error}
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
