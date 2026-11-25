"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { ExercisePicker } from "@/components/strength/exercise-picker";
import {
  Dashed,
  FieldError,
  inputClass,
  labelClass,
  PrintBar,
  printButtonClass,
  SlipHeader,
} from "@/components/ui";
import { ApiError, archiveTemplate, createTemplate, replaceTemplate } from "@/lib/client/api";
import type { ActivityType, ExerciseSummary } from "@/lib/domain/activity-types";
import type { TemplateDetail } from "@/lib/domain/template-types";
import {
  newRegularExercise,
  newRegularForm,
  regularFormToPayload,
  templateToRegularForm,
  type RegularForm,
  type RegularFormExercise,
} from "@/lib/domain/templates";
import type { Units } from "@/lib/domain/units";
import { uuid } from "@/lib/uuid";

const TYPES: { type: ActivityType; label: string }[] = [
  { type: "running", label: "RUN" },
  { type: "walking", label: "WALK" },
  { type: "strength", label: "STRENGTH" },
];

const cell =
  "h-10 w-full min-w-0 border-2 border-ink bg-white px-1.5 text-center text-sm font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-blue aria-[invalid=true]:border-red aria-[invalid=true]:bg-red/10";
const tiny =
  "flex size-8 shrink-0 items-center justify-center border-2 border-ink bg-white text-xs font-extrabold disabled:opacity-30";

interface Props {
  mode: "new" | "edit";
  units: Units;
  /** edit: the regular being changed */
  template?: TemplateDetail;
}

/** Set up or change a regular: name, targets, and (strength) the ordered items. */
export function RegularEditor({ mode, units, template }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<RegularForm>(() =>
    template ? templateToRegularForm(template, units, uuid) : newRegularForm(uuid()),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const set = <K extends keyof RegularForm>(k: K, v: RegularForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const updateExercise = (key: string, patch: Partial<RegularFormExercise>) =>
    setForm((f) => ({ ...f, exercises: f.exercises.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));
  const moveExercise = (i: number, delta: -1 | 1) =>
    setForm((f) => {
      const to = i + delta;
      if (to < 0 || to >= f.exercises.length) return f;
      const next = f.exercises.slice();
      const [item] = next.splice(i, 1);
      next.splice(to, 0, item!);
      return { ...f, exercises: next };
    });

  const onPick = useCallback((ex: ExerciseSummary) => {
    setPickerOpen(false);
    setForm((f) => ({ ...f, exercises: [...f.exercises, newRegularExercise(ex, uuid())] }));
    setErrors((e) => {
      const rest = { ...e };
      delete rest.exercises;
      return rest;
    });
  }, []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const r = regularFormToPayload(form, units);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (mode === "new") await createTemplate(r.payload);
      else await replaceTemplate(r.payload);
      router.push("/regulars");
      router.refresh();
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Try again.");
      }
    }
  }

  async function archive() {
    if (!template) return;
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    setSaving(true);
    try {
      await archiveTemplate(template.id);
      router.push("/regulars");
      router.refresh();
    } catch (err) {
      setSaving(false);
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  const errId = (k: string) => (errors[k] ? `err-${k.replaceAll(".", "-")}` : undefined);
  const cardio = form.type !== "strength";
  const weightUnit = units.weight.toUpperCase();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-36">
      <SlipHeader
        back="/regulars"
        eyebrow="REGULARS"
        title={
          mode === "edit" ? (
            <>
              Change the
              <br />
              regular
            </>
          ) : (
            <>
              A new
              <br />
              regular
            </>
          )
        }
      />

      <form
        id="regular-editor"
        onSubmit={submit}
        noValidate
        className="mt-4 bg-paper p-4 text-xs text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]"
      >
        <div role="group" aria-label="Type" className="flex gap-2">
          {TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              aria-pressed={form.type === t.type}
              // A strength regular with items keeps its type; clear the items first.
              disabled={mode === "edit" && form.type === "strength" && t.type !== "strength" && form.exercises.length > 0}
              onClick={() => set("type", t.type)}
              className={`h-9 flex-1 border-2 border-ink font-extrabold disabled:opacity-30 ${
                form.type === t.type ? "bg-ink text-white" : "bg-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <label htmlFor="name" className={labelClass}>
            NAME
          </label>
          <input
            id="name"
            value={form.name}
            maxLength={80}
            placeholder={cardio ? "The 5K" : "Upper Body A"}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errId("name")}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
          />
          <FieldError id={errId("name")} message={errors.name} />
        </div>

        <Dashed className="my-3.5" />

        {cardio ? (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label htmlFor="target-distance" className={labelClass}>
                DISTANCE ({units.distance.toUpperCase()})
              </label>
              <input
                id="target-distance"
                inputMode="decimal"
                placeholder="5.0"
                value={form.distance}
                aria-invalid={Boolean(errors.targetDistanceM)}
                aria-describedby={errId("targetDistanceM")}
                onChange={(e) => set("distance", e.target.value)}
                className={inputClass}
              />
              <FieldError id={errId("targetDistanceM")} message={errors.targetDistanceM} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="target-duration" className={labelClass}>
                TARGET TIME
              </label>
              <input
                id="target-duration"
                inputMode="numeric"
                placeholder="30:00"
                value={form.duration}
                aria-invalid={Boolean(errors.targetDurationSec)}
                aria-describedby={errId("targetDurationSec")}
                onChange={(e) => set("duration", e.target.value)}
                className={inputClass}
              />
              <FieldError id={errId("targetDurationSec")} message={errors.targetDurationSec} />
            </div>
            <p className="col-span-2 text-[10px] text-muted">Both optional. Ringing it up fills them in on the slip.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_44px_52px_52px] gap-1.5 border-b-2 border-dashed border-ink pb-1.5 font-extrabold text-muted">
              <span>ITEM</span>
              <span className="text-center">SETS</span>
              <span className="text-center">REPS/T</span>
              <span className="text-center">{weightUnit}</span>
            </div>
            <ol aria-label="Items">
              {form.exercises.map((ex, i) => {
                const at = `exercises.${i}`;
                const timed = ex.tracking === "time";
                const rowErrors = ["targetSets", "targetReps", "targetDurationSec", "targetWeightKg"]
                  .map((f) => errors[`${at}.${f}`])
                  .filter(Boolean);
                return (
                  <li key={ex.key} className="border-b border-dotted border-rule py-2">
                    <div className="grid grid-cols-[1fr_44px_52px_52px] items-center gap-1.5">
                      <span className="truncate text-[13px] font-extrabold uppercase">{ex.name}</span>
                      <input
                        aria-label={`Sets for ${ex.name}`}
                        aria-invalid={Boolean(errors[`${at}.targetSets`])}
                        inputMode="numeric"
                        value={ex.sets}
                        onChange={(e) => updateExercise(ex.key, { sets: e.target.value })}
                        className={cell}
                      />
                      {timed ? (
                        <input
                          aria-label={`Time per set for ${ex.name}`}
                          aria-invalid={Boolean(errors[`${at}.targetDurationSec`])}
                          inputMode="numeric"
                          placeholder="sec"
                          value={ex.time}
                          onChange={(e) => updateExercise(ex.key, { time: e.target.value })}
                          className={cell}
                        />
                      ) : (
                        <input
                          aria-label={`Reps for ${ex.name}`}
                          aria-invalid={Boolean(errors[`${at}.targetReps`])}
                          inputMode="numeric"
                          placeholder="—"
                          value={ex.reps}
                          onChange={(e) => updateExercise(ex.key, { reps: e.target.value })}
                          className={cell}
                        />
                      )}
                      <input
                        aria-label={`Weight in ${units.weight} for ${ex.name}`}
                        aria-invalid={Boolean(errors[`${at}.targetWeightKg`])}
                        inputMode="decimal"
                        placeholder="BW"
                        value={ex.weight}
                        onChange={(e) => updateExercise(ex.key, { weight: e.target.value })}
                        className={cell}
                      />
                    </div>
                    {rowErrors.length ? (
                      <p role="alert" className="mt-1 text-[11px] font-extrabold text-red">
                        {rowErrors[0]}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex justify-end gap-1 text-[11px] font-extrabold">
                      <button
                        type="button"
                        aria-label={`Move ${ex.name} up`}
                        disabled={i === 0}
                        onClick={() => moveExercise(i, -1)}
                        className={tiny}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${ex.name} down`}
                        disabled={i === form.exercises.length - 1}
                        onClick={() => moveExercise(i, 1)}
                        className={tiny}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${ex.name}`}
                        onClick={() => setForm((f) => ({ ...f, exercises: f.exercises.filter((e) => e.key !== ex.key) }))}
                        className="h-8 border-2 border-red bg-white px-2 text-red"
                      >
                        REMOVE
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {form.exercises.length === 0 ? (
              <p className="py-3 text-muted">No items yet. Add the exercises you always do.</p>
            ) : null}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-2.5 h-11 w-full border-2 border-dashed border-ink text-[13px] font-extrabold"
            >
              + ADD AN ITEM
            </button>
            <FieldError message={errors.exercises} />
            <p className="mt-1.5 text-[10px] text-muted">
              Ringing it up fills each item with the sets you did last time, or these targets if it&apos;s new.
            </p>
          </>
        )}

        <Dashed className="mt-3.5 mb-2" />
        <label htmlFor="notes" className={labelClass}>
          NOTES
        </label>
        <textarea
          id="notes"
          rows={2}
          maxLength={2000}
          value={form.notes}
          placeholder="warm up first, tempo on the last set…"
          onChange={(e) => set("notes", e.target.value)}
          className="mt-1 w-full border-2 border-ink bg-white p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue"
        />
        <FieldError message={errors.notes} />

        {formError || Object.keys(errors).length ? (
          <p role="alert" className="mt-3 border-2 border-red px-2.5 py-2 font-extrabold text-red">
            {formError ?? "Check the fields marked in red."}
          </p>
        ) : null}

        {mode === "edit" && template ? (
          <>
            <Dashed className="mt-4 mb-2" />
            <button
              type="button"
              onClick={archive}
              disabled={saving}
              className="h-11 w-full border-2 border-red bg-white text-[13px] font-extrabold text-red disabled:opacity-60"
            >
              {confirmArchive ? "TAP AGAIN TO TAKE IT OFF THE MENU" : "DELETE REGULAR"}
            </button>
            <p className="mt-1 text-[10px] text-muted">
              Past workouts logged from it keep all their data.
            </p>
          </>
        ) : null}
      </form>

      <PrintBar>
        <button type="submit" form="regular-editor" disabled={saving} className={printButtonClass}>
          {saving ? "SAVING…" : "SAVE REGULAR"}
        </button>
      </PrintBar>

      {pickerOpen ? <ExercisePicker onPick={onPick} onClose={closePicker} /> : null}
    </main>
  );
}
