"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ExerciseItem } from "@/components/strength/exercise-item";
import { ExercisePicker } from "@/components/strength/exercise-picker";
import { FromRegularBanner, RegularOffer, useRegularOffer } from "@/components/regulars/slip-regular";
import {
  Dashed,
  FeelPicker,
  FieldError,
  inputClass,
  labelClass,
  PrintBar,
  printButtonClass,
  PrinterIcon,
  SlipHeader,
} from "@/components/ui";
import { ApiError, createActivity, lastSets, replaceActivity } from "@/lib/client/api";
import type { ActivityDetail, ExerciseSummary, LastSets } from "@/lib/domain/activity-types";
import type { TemplateDetail } from "@/lib/domain/template-types";
import { strengthDraftDiffers, templateToStrengthDraft } from "@/lib/domain/templates";
import {
  activityToDraft,
  addExercise,
  addSet,
  draftHasContent,
  draftStorageKey,
  draftToPayload,
  draftTotals,
  moveExercise,
  moveSet,
  newDraft,
  parseStoredDraft,
  removeExercise,
  removeSet,
  resetTimer,
  startTimer,
  stopTimer,
  timerElapsedMs,
  updateSet,
  type StrengthDraft,
} from "@/lib/domain/strength-draft";
import { formatReceiptDate } from "@/lib/domain/dates";
import { formatClock, type WeightUnit } from "@/lib/domain/units";
import { uuid } from "@/lib/uuid";

interface Props {
  mode: "new" | "edit";
  weightUnit: WeightUnit;
  today?: string;
  nowTime?: string;
  /** edit mode: the saved workout */
  activity?: ActivityDetail;
  /** new: the regular this slip was rung up from */
  regular?: TemplateDetail;
  /** the last logged sets of each of the regular's exercises (pre-fill) */
  lasts?: Record<string, LastSets | null>;
  /** exerciseId → "TOP SET 42.5 KG × 8 · +2.5 KG VS PREV WEEK" (regular ring-ups) */
  hints?: Record<string, string>;
}

const noopSubscribe = () => () => {};

/**
 * Strength order slip (mockup 6). The draft lives in local storage, which
 * only exists in the browser, so the slip renders after hydration.
 */
export function StrengthSlip(props: Props) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) {
    return (
      <main className="mx-auto w-full max-w-xl px-5 pt-14" aria-busy="true">
        <div className="mt-24 h-[520px] animate-pulse bg-paper/40" />
      </main>
    );
  }
  return <StrengthSlipInner {...props} />;
}

function freshDraft(p: Props, date?: string): StrengthDraft {
  if (p.mode === "edit" && p.activity) return activityToDraft(p.activity, p.weightUnit, uuid);
  const o = { id: uuid(), date: p.today ?? date ?? "", startTime: p.nowTime, weightUnit: p.weightUnit };
  return p.regular ? templateToStrengthDraft(p.regular, p.lasts ?? {}, o, uuid) : newDraft(o);
}

function loadInitial(p: Props): { draft: StrengthDraft; restored: boolean } {
  const key = draftStorageKey(p.mode, p.activity?.id, p.regular?.id);
  const stored = parseStoredDraft(window.localStorage.getItem(key));
  if (stored && (p.mode === "new" || stored.id === p.activity?.id)) return { draft: stored, restored: true };
  return { draft: freshDraft(p), restored: false };
}

function StrengthSlipInner(props: Props) {
  const { mode } = props;
  const router = useRouter();
  const [initial] = useState(() => loadInitial(props));
  const [draft, setDraft] = useState<StrengthDraft>(initial.draft);
  const [restored, setRestored] = useState(initial.restored);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [altShown, setAltShown] = useState<ReadonlySet<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const draftRef = useRef(draft);
  const savedRef = useRef(false);
  const storageKey = draftStorageKey(mode, props.activity?.id, props.regular?.id);
  const changed = props.regular ? strengthDraftDiffers(draft, props.regular) : false;
  const offer = useRegularOffer(props.regular, changed);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Persist on every change, so a reload never loses the workout.
  useEffect(() => {
    if (savedRef.current) return;
    // Edits are kept once something changed; a new slip once it has content.
    const keep = mode === "edit" ? draft !== initial.draft || initial.restored : draftHasContent(draft);
    try {
      if (keep) window.localStorage.setItem(storageKey, JSON.stringify(draft));
      else window.localStorage.removeItem(storageKey);
    } catch {
      // Storage full or disabled (private mode): the slip still works.
    }
  }, [draft, storageKey, mode, initial]);

  // Tick the timer display while it runs.
  const running = draft.timer.startedAt !== null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const update = useCallback((fn: (d: StrengthDraft) => StrengthDraft) => setDraft((d) => fn(d)), []);
  const toggle = (setter: typeof setExpanded, key: string) =>
    setter((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onPick = useCallback(async (ex: ExerciseSummary) => {
    setPickerOpen(false);
    const last = await lastSets(ex.id);
    const next = addExercise(draftRef.current, ex, uuid, last);
    const added = next.exercises[next.exercises.length - 1]!;
    setDraft(next);
    setExpanded((s) => new Set(s).add(added.key));
    setErrors((e) => {
      const rest = { ...e };
      delete rest.exercises;
      return rest;
    });
  }, []);

  const closePicker = useCallback(() => setPickerOpen(false), []);

  function startOver() {
    window.localStorage.removeItem(storageKey);
    setDraft(freshDraft(props, draft.date));
    setRestored(false);
    setErrors({});
    setExpanded(new Set());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const r = draftToPayload(draft);
    if (!r.ok) {
      setErrors(r.errors);
      expandErrored(r.errors);
      return;
    }
    setErrors({});
    if (mode === "new" && !offer.check()) return;
    setSaving(true);
    try {
      let payload = r.payload;
      if (mode === "new") {
        const reg = await offer.apply(payload);
        if (!reg.ok) {
          setSaving(false);
          setFormError(reg.message);
          return;
        }
        payload = { ...payload, templateId: reg.templateId };
      }
      const saved = mode === "new" ? await createActivity(payload) : await replaceActivity(payload);
      savedRef.current = true;
      window.localStorage.removeItem(storageKey);
      router.push(`/activities/${saved.id}?printed=1`);
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError) {
        setErrors(err.fields);
        expandErrored(err.fields);
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Try again.");
      }
    }
  }

  function expandErrored(errs: Record<string, string>) {
    const idx = new Set(
      Object.keys(errs)
        .map((k) => /^exercises\.(\d+)\./.exec(k)?.[1])
        .filter((v): v is string => v !== undefined)
        .map(Number),
    );
    if (idx.size) {
      setExpanded((s) => {
        const next = new Set(s);
        draft.exercises.forEach((ex, i) => idx.has(i) && next.add(ex.key));
        return next;
      });
    }
  }

  const totals = draftTotals(draft);
  const elapsed = Math.round(timerElapsedMs(draft.timer, now) / 1000);
  const unit = draft.weightUnit.toUpperCase();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-36">
      <SlipHeader
        back={mode === "edit" ? `/activities/${draft.id}` : "/"}
        title={
          mode === "edit" ? (
            <>
              Fixing the
              <br />
              order
            </>
          ) : (
            <>
              Heavy items,
              <br />
              please
            </>
          )
        }
      />

      {restored ? (
        <div role="status" className="mt-4 flex items-center justify-between gap-3 bg-yellow px-3 py-2 text-xs font-extrabold text-ink">
          <span>
            {mode === "edit" ? "UNSAVED CHANGES RESTORED" : "PICKED UP WHERE YOU LEFT OFF"}
            {/* A slip left unsaved last week keeps its old date: say so, so it is not logged in the wrong week. */}
            {mode === "new" && props.today && draft.date && draft.date !== props.today
              ? ` · DATED ${formatReceiptDate(draft.date)}`
              : null}
          </span>
          <button type="button" onClick={startOver} className="underline underline-offset-2">
            START OVER
          </button>
        </div>
      ) : null}

      <form
        id="strength-slip"
        onSubmit={submit}
        noValidate
        className="mt-4 bg-paper p-4 text-xs text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]"
      >
        {props.regular ? <FromRegularBanner name={props.regular.name} /> : null}
        <div className="flex items-center justify-between gap-2">
          <span className={labelClass}>WORKOUT TIMER</span>
          <span className="font-display text-2xl font-extrabold tabular-nums" aria-label="Elapsed time" role="timer">
            {formatClock(elapsed)}
          </span>
          <span className="flex gap-1.5">
            <button
              type="button"
              onClick={() => update((d) => (running ? stopTimer(d, Date.now()) : startTimer(d, Date.now())))}
              className={`h-9 border-2 border-ink px-2.5 font-extrabold ${running ? "bg-yellow" : "bg-white"}`}
            >
              {running ? "PAUSE" : elapsed > 0 ? "RESUME" : "START"}
            </button>
            {elapsed > 0 && !running ? (
              <button type="button" onClick={() => update(resetTimer)} className="h-9 border-2 border-ink bg-white px-2.5 font-extrabold">
                RESET
              </button>
            ) : null}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1">
            <label htmlFor="date" className={labelClass}>
              DATE
            </label>
            <input
              id="date"
              type="date"
              value={draft.date}
              aria-invalid={Boolean(errors.date)}
              onChange={(e) => update((d) => ({ ...d, date: e.target.value }))}
              className={`${inputClass} text-sm`}
            />
            <FieldError message={errors.date} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="start-time" className={labelClass}>
              TIME
            </label>
            <input
              id="start-time"
              type="time"
              value={draft.startTime}
              onChange={(e) => update((d) => ({ ...d, startTime: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_76px_56px] gap-1.5 border-b-2 border-dashed border-ink pb-1.5 font-extrabold text-muted">
          <span>ITEM</span>
          <span>SETS</span>
          <span className="text-right">{unit}</span>
        </div>
        <ul aria-label="Items">
          {draft.exercises.map((ex, i) => (
            <ExerciseItem
              key={ex.key}
              index={i}
              count={draft.exercises.length}
              exercise={ex}
              weightUnit={draft.weightUnit}
              hint={props.hints?.[ex.exerciseId]}
              expanded={expanded.has(ex.key)}
              showAlt={altShown.has(ex.key)}
              errors={errors}
              onToggle={() => toggle(setExpanded, ex.key)}
              onToggleAlt={() => toggle(setAltShown, ex.key)}
              onAddSet={() => {
                update((d) => addSet(d, ex.key, uuid()));
              }}
              onRemoveSet={(k) => update((d) => removeSet(d, ex.key, k))}
              onMoveSet={(k, delta) => update((d) => moveSet(d, ex.key, k, delta))}
              onUpdateSet={(k, patch) => update((d) => updateSet(d, ex.key, k, patch))}
              onMove={(delta) => update((d) => moveExercise(d, ex.key, delta))}
              onRemove={() => update((d) => removeExercise(d, ex.key))}
            />
          ))}
        </ul>
        {draft.exercises.length === 0 ? (
          <p className="py-3 text-muted">Nothing on the slip yet. Add your first item.</p>
        ) : null}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-2.5 h-11 w-full border-2 border-dashed border-ink text-[13px] font-extrabold"
        >
          + ADD AN ITEM
        </button>
        <FieldError message={errors.exercises} />

        <Dashed className="mt-3.5 mb-2" />
        <div className="flex justify-between">
          <span>ITEMS</span>
          <span>{totals.items}</span>
        </div>
        <div className="flex justify-between">
          <span>TOTAL SETS</span>
          <span>{totals.sets}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <label htmlFor="duration" className="font-extrabold">
            DURATION
          </label>
          <input
            id="duration"
            placeholder={elapsed > 0 ? formatClock(elapsed) : "43 MIN"}
            value={draft.duration}
            aria-invalid={Boolean(errors.durationSec)}
            aria-describedby="duration-hint"
            onChange={(e) => update((d) => ({ ...d, duration: e.target.value }))}
            className={`${inputClass.replace("w-full", "")} h-10 w-32 text-right text-sm`}
          />
        </div>
        <p id="duration-hint" className="text-right text-[10px] text-muted">
          blank = timer, else the sum of set times
        </p>
        <FieldError message={errors.durationSec} />

        <Dashed className="mt-2.5 mb-2" />
        <FeelPicker value={draft.feel} onChange={(f) => update((d) => ({ ...d, feel: f }))} />

        <Dashed className="mt-2.5 mb-2" />
        <label htmlFor="notes" className={labelClass}>
          COMMENTS
        </label>
        <textarea
          id="notes"
          rows={2}
          maxLength={2000}
          value={draft.notes}
          placeholder="felt strong, new PR…"
          onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))}
          className="mt-1 w-full border-2 border-ink bg-white p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue"
        />
        <FieldError message={errors.notes} />

        {mode === "new" ? (
          <>
            <Dashed className="mt-2.5 mb-1.5" />
            <RegularOffer regular={props.regular} changed={changed} offer={offer} />
          </>
        ) : null}

        {formError || Object.keys(errors).length ? (
          <p role="alert" className="mt-3 border-2 border-red px-2.5 py-2 font-extrabold text-red">
            {formError ?? "Check the items marked in red."}
          </p>
        ) : null}
      </form>

      <PrintBar>
        <button type="submit" form="strength-slip" disabled={saving} className={printButtonClass}>
          <PrinterIcon />
          {saving ? "PRINTING…" : mode === "edit" ? "REPRINT RECEIPT" : "PRINT RECEIPT"}
        </button>
      </PrintBar>

      {pickerOpen ? <ExercisePicker onPick={onPick} onClose={closePicker} /> : null}
    </main>
  );
}
