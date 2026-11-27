"use client";

import { summarizeDraftExercise, type DraftExercise, type DraftSet } from "@/lib/domain/strength-draft";
import type { WeightUnit } from "@/lib/domain/units";

const cell =
  "h-10 w-full min-w-0 border-2 border-ink bg-white px-1.5 text-center text-sm font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-blue aria-[invalid=true]:border-red aria-[invalid=true]:bg-red/10";
const tiny = "flex size-8 shrink-0 items-center justify-center border-2 border-ink bg-white text-xs font-extrabold disabled:opacity-30";

interface Props {
  index: number;
  count: number;
  exercise: DraftExercise;
  weightUnit: WeightUnit;
  /** last logged week vs the one before, e.g. "TOP SET 42.5 KG × 8 · +2.5 KG VS PREV WEEK" */
  hint?: string;
  expanded: boolean;
  showAlt: boolean;
  errors: Record<string, string>;
  onToggle: () => void;
  onToggleAlt: () => void;
  onAddSet: () => void;
  onRemoveSet: (setKey: string) => void;
  onMoveSet: (setKey: string, delta: -1 | 1) => void;
  onUpdateSet: (setKey: string, patch: Partial<Omit<DraftSet, "key">>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}

/**
 * One item on the slip: the compact "3 × 10 reps · 40" line; tap to expand
 * the per-set rows (reps · time · weight). Reps-tracked items show reps with
 * time on demand; time-tracked items (plank) show time with reps on demand.
 */
export function ExerciseItem(p: Props) {
  const { exercise: ex, index } = p;
  const summary = summarizeDraftExercise(ex);
  const primary: "reps" | "time" = ex.tracking;
  const alt: "reps" | "time" = primary === "reps" ? "time" : "reps";
  const hasAltValues = ex.sets.some((s) => s[alt].trim() !== "");
  const showAlt = p.showAlt || hasAltValues;
  const columns: ("reps" | "time")[] = showAlt ? (primary === "reps" ? ["reps", "time"] : ["time", "reps"]) : [primary];
  const unit = p.weightUnit.toUpperCase();
  const panelId = `item-${ex.key}`;
  const err = (j: number, field: string) => p.errors[`exercises.${index}.sets.${j}.${field}`];
  const itemError = p.errors[`exercises.${index}.sets`] ?? p.errors[`exercises.${index}.exerciseId`];
  const setErrors = ex.sets.flatMap((_, j) =>
    ["reps", "durationSec", "weightKg"].map((f) => err(j, f)).filter(Boolean),
  );

  const label = (s: number, what: string) => `Set ${s} ${what} for ${ex.name}`;

  return (
    <li className="border-b border-dotted border-rule">
      <div className="grid grid-cols-[1fr_76px_56px] items-center gap-1.5 py-2">
        <button
          type="button"
          aria-expanded={p.expanded}
          aria-controls={panelId}
          onClick={p.onToggle}
          className="flex min-w-0 flex-col text-left"
        >
          <span className="truncate text-[13px] font-extrabold uppercase">{ex.name}</span>
          <span className={`text-[11px] ${setErrors.length || itemError ? "font-extrabold text-red" : "text-muted"}`}>
            {setErrors.length || itemError ? "CHECK THE SETS ↓" : summary.line}
          </span>
        </button>
        <span className="flex items-center gap-1">
          <button type="button" aria-label={`Add a set of ${ex.name}`} onClick={p.onAddSet} className={`${tiny} size-[30px] text-[15px]`}>
            +
          </button>
          <span className="font-extrabold">×{summary.setCount}</span>
        </span>
        <span className="text-right font-extrabold">{summary.weight}</span>
      </div>

      {p.expanded ? (
        <div id={panelId} className="mb-2.5 bg-[#f4f1ea] p-2">
          {p.hint ? (
            <p className="mb-1.5 text-[10px] font-extrabold text-muted" data-testid="progress-hint">
              LATEST WEEK: {p.hint}
            </p>
          ) : null}
          <div
            className="grid items-center gap-1.5 pb-1 text-[10px] font-extrabold text-muted"
            style={{ gridTemplateColumns: `18px repeat(${columns.length + 1}, minmax(0,1fr)) 104px` }}
          >
            <span>#</span>
            {columns.map((c) => (
              <span key={c} className="text-center">
                {c === "reps" ? "REPS" : "TIME"}
              </span>
            ))}
            <span className="text-center">{unit}</span>
            <span />
          </div>
          <ol>
            {ex.sets.map((s, j) => (
              <li
                key={s.key}
                className="grid items-start gap-1.5 py-0.5"
                style={{ gridTemplateColumns: `18px repeat(${columns.length + 1}, minmax(0,1fr)) 104px` }}
              >
                <span className="pt-2.5 text-xs font-extrabold">{j + 1}</span>
                {columns.map((c) =>
                  c === "reps" ? (
                    <input
                      key={c}
                      aria-label={label(j + 1, "reps")}
                      aria-invalid={Boolean(err(j, "reps"))}
                      inputMode="numeric"
                      placeholder="—"
                      value={s.reps}
                      onChange={(e) => p.onUpdateSet(s.key, { reps: e.target.value })}
                      className={cell}
                    />
                  ) : (
                    <input
                      key={c}
                      aria-label={label(j + 1, "time")}
                      aria-invalid={Boolean(err(j, "durationSec"))}
                      inputMode="numeric"
                      placeholder="sec"
                      value={s.time}
                      onChange={(e) => p.onUpdateSet(s.key, { time: e.target.value })}
                      className={cell}
                    />
                  ),
                )}
                <input
                  aria-label={label(j + 1, `weight in ${p.weightUnit}`)}
                  aria-invalid={Boolean(err(j, "weightKg"))}
                  inputMode="decimal"
                  placeholder="BW"
                  value={s.weight}
                  onChange={(e) => p.onUpdateSet(s.key, { weight: e.target.value })}
                  className={cell}
                />
                <span className="flex justify-end gap-1 pt-1">
                  <button
                    type="button"
                    aria-label={`Move set ${j + 1} up`}
                    disabled={j === 0}
                    onClick={() => p.onMoveSet(s.key, -1)}
                    className={tiny}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move set ${j + 1} down`}
                    disabled={j === ex.sets.length - 1}
                    onClick={() => p.onMoveSet(s.key, 1)}
                    className={tiny}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove set ${j + 1}`}
                    onClick={() => p.onRemoveSet(s.key)}
                    className={tiny}
                  >
                    ✕
                  </button>
                </span>
                {err(j, "reps") || err(j, "durationSec") || err(j, "weightKg") ? (
                  <p role="alert" className="col-span-full text-[11px] font-extrabold text-red">
                    {err(j, "reps") ?? err(j, "durationSec") ?? err(j, "weightKg")}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          {itemError ? (
            <p role="alert" className="text-[11px] font-extrabold text-red">
              {itemError}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-extrabold">
            <button type="button" onClick={p.onAddSet} className="h-8 border-2 border-ink bg-white px-2">
              + SET
            </button>
            {!hasAltValues ? (
              <button type="button" onClick={p.onToggleAlt} aria-pressed={showAlt} className="h-8 border-2 border-ink bg-white px-2">
                {showAlt ? `HIDE ${alt.toUpperCase()}` : `+ ${alt.toUpperCase()}`}
              </button>
            ) : null}
            <span className="flex-1" />
            <button
              type="button"
              aria-label={`Move ${ex.name} up`}
              disabled={index === 0}
              onClick={() => p.onMove(-1)}
              className={tiny}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${ex.name} down`}
              disabled={index === p.count - 1}
              onClick={() => p.onMove(1)}
              className={tiny}
            >
              ↓
            </button>
            <button type="button" onClick={p.onRemove} className="h-8 border-2 border-red bg-white px-2 text-red">
              REMOVE
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
