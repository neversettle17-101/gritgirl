"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { inputClass, labelClass } from "@/components/ui";
import { ApiError, createExercise, searchExercises } from "@/lib/client/api";
import type { ExerciseSummary, Tracking } from "@/lib/domain/activity-types";
import { EQUIPMENT, MUSCLES } from "@/lib/validation/exercises";

interface Props {
  onPick: (exercise: ExerciseSummary) => void;
  onClose: () => void;
}

/**
 * "+ ADD AN ITEM": search the library and my custom exercises (typo-tolerant,
 * filter by muscle / equipment), or create a custom exercise.
 */
export function ExercisePicker({ onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [results, setResults] = useState<ExerciseSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [customTracking, setCustomTracking] = useState<Tracking>("reps");
  const [createError, setCreateError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await searchExercises({ q: q.trim(), muscle, equipment, limit: 40 }, ctl.signal);
        setResults(rows);
        setError(null);
      } catch (e) {
        if (!ctl.signal.aborted) setError(e instanceof ApiError ? e.message : "Search failed");
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, muscle, equipment]);

  async function createCustom(e: FormEvent) {
    e.preventDefault();
    const name = q.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const ex = await createExercise({
        name,
        tracking: customTracking,
        primaryMuscles: muscle ? [muscle as (typeof MUSCLES)[number]] : [],
        equipment: equipment ? (equipment as (typeof EQUIPMENT)[number]) : null,
      });
      onPick(ex);
    } catch (err) {
      setCreateError(err instanceof ApiError ? (err.fields.name ?? err.message) : "Could not create it");
      setCreating(false);
    }
  }

  const trimmed = q.trim();
  const exact = results?.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/60 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-xl flex-col bg-paper text-ink shadow-2xl"
      >
        <div className="flex items-center justify-between border-b-2 border-dashed border-ink px-4 py-3">
          <h2 id={titleId} className="font-display text-xl font-extrabold">
            Add an item
          </h2>
          <button type="button" onClick={onClose} className="px-2 py-1 text-xs font-extrabold underline">
            CLOSE
          </button>
        </div>

        <div className="flex flex-col gap-2 px-4 pt-3">
          <label htmlFor="ex-search" className={labelClass}>
            SEARCH EXERCISES
          </label>
          <input
            id="ex-search"
            ref={searchRef}
            type="search"
            autoComplete="off"
            placeholder="squat, plank, hip thrust…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Filter by muscle"
              value={muscle}
              onChange={(e) => setMuscle(e.target.value)}
              className={`${inputClass} text-xs`}
            >
              <option value="">ANY MUSCLE</option>
              {MUSCLES.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by equipment"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className={`${inputClass} text-xs`}
            >
              <option value="">ANY EQUIPMENT</option>
              {EQUIPMENT.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-2 min-h-40 flex-1 overflow-y-auto px-4 pb-2" aria-busy={loading}>
          {error ? (
            <p role="alert" className="py-3 text-xs font-extrabold text-red">
              {error}
            </p>
          ) : null}
          {results && results.length === 0 && !loading ? (
            <p className="py-3 text-xs text-muted">Nothing on the menu by that name.</p>
          ) : null}
          <ul aria-label="Exercises">
            {(results ?? []).map((ex) => (
              <li key={ex.id} className="border-b border-dotted border-rule">
                <button
                  type="button"
                  onClick={() => onPick(ex)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-blue"
                >
                  <span className="flex flex-col">
                    <span className="text-[13px] font-extrabold">{ex.name}</span>
                    <span className="text-[11px] text-muted">
                      {[ex.custom ? "MY EXERCISE" : null, ex.equipment, ex.primaryMuscles[0]]
                        .filter(Boolean)
                        .join(" · ")
                        .toUpperCase()}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-extrabold">{ex.tracking === "time" ? "TIMED" : "REPS"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {trimmed && !exact ? (
          <form onSubmit={createCustom} className="border-t-2 border-dashed border-ink px-4 py-3">
            <p className="text-xs">
              Not on the menu? Add <strong>“{trimmed}”</strong> as your own exercise.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div role="radiogroup" aria-label="Track by" className="flex">
                {(["reps", "time"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={customTracking === t}
                    onClick={() => setCustomTracking(t)}
                    className={`h-10 border-2 border-ink px-3 text-xs font-extrabold ${
                      customTracking === t ? "bg-ink text-white" : "bg-white"
                    }`}
                  >
                    {t === "reps" ? "REPS" : "TIME"}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={creating}
                className="h-10 flex-1 bg-ink px-3 text-xs font-extrabold text-white disabled:opacity-60"
              >
                {creating ? "ADDING…" : "CREATE & ADD"}
              </button>
            </div>
            {createError ? (
              <p role="alert" className="mt-1 text-[11px] font-extrabold text-red">
                {createError}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
