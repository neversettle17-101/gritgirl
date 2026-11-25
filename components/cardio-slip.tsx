"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Dashed,
  FEEL_LABEL,
  FeelPicker,
  FieldError,
  inputClass,
  labelClass,
  PrintBar,
  printButtonClass,
  PrinterIcon,
  SlipHeader,
} from "@/components/ui";
import { FromRegularBanner, RegularOffer, useRegularOffer } from "@/components/regulars/slip-regular";
import { ApiError, createActivity, replaceActivity } from "@/lib/client/api";
import { cardioFormToPayload, newCardioForm, stepDistance, type CardioForm } from "@/lib/domain/cardio-form";
import type { TemplateDetail } from "@/lib/domain/template-types";
import { cardioFormDiffers, templateToCardioForm } from "@/lib/domain/templates";
import { formatMinutes, formatPace, parseDecimal, parseDuration, toMetres, type DistanceUnit } from "@/lib/domain/units";
import { uuid } from "@/lib/uuid";

interface Props {
  mode: "new" | "edit";
  type: "running" | "walking";
  distanceUnit: DistanceUnit;
  /** new: today's local date and time; edit: the saved activity as a form */
  today?: string;
  nowTime?: string;
  initial?: CardioForm;
  /** new: the regular this slip was rung up from (pre-fills the targets) */
  regular?: TemplateDetail;
}

/** Run / walk order slip (mockup 5): distance, duration, time, HR, feel, comments, derived pace. */
export function CardioSlip({ mode, type, distanceUnit, today, nowTime, initial, regular }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<CardioForm>(() => {
    if (initial) return initial;
    const o = { id: uuid(), type, date: today ?? "", startTime: nowTime };
    return regular ? templateToCardioForm(regular, o, distanceUnit) : newCardioForm(o);
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changed = regular ? cardioFormDiffers(form, distanceUnit, regular) : false;
  const offer = useRegularOffer(regular, changed);

  const set = <K extends keyof CardioForm>(k: K, v: CardioForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const word = form.type === "walking" ? "walk" : "run";
  const unit = distanceUnit.toUpperCase();
  const durationSec = parseDuration(form.duration, "minutes");
  const distanceNum = parseDecimal(form.distance);
  const distanceM = distanceNum === null ? null : toMetres(distanceNum, distanceUnit);
  const pace = formatPace(durationSec, distanceM, distanceUnit);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const r = cardioFormToPayload(form, distanceUnit);
    if (!r.ok) {
      setErrors(r.errors);
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
      router.push(`/activities/${saved.id}?printed=1`);
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

  const errId = (k: string) => (errors[k] ? `err-${k}` : undefined);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-36">
      <SlipHeader
        back={mode === "edit" ? `/activities/${form.id}` : "/"}
        title={
          mode === "edit" ? (
            <>
              Fixing the
              <br />
              order
            </>
          ) : (
            <>
              One {word},
              <br />
              coming up
            </>
          )
        }
      />

      <form
        id="cardio-slip"
        onSubmit={submit}
        noValidate
        className="mt-4 bg-paper p-4 text-xs text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]"
      >
        {regular ? <FromRegularBanner name={regular.name} /> : null}
        {mode === "edit" ? (
          <div role="group" aria-label="Type" className="-m-1 mb-3 flex gap-2">
            {(["running", "walking"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={form.type === t}
                onClick={() => set("type", t)}
                className={`h-9 flex-1 border-2 border-ink font-extrabold ${form.type === t ? "bg-ink text-white" : "bg-white"}`}
              >
                {t === "running" ? "RUN" : "WALK"}
              </button>
            ))}
          </div>
        ) : null}

        <div className={labelClass} aria-hidden="true">
          QTY · DISTANCE
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Less distance"
            onClick={() => set("distance", stepDistance(form.distance, -0.1))}
            className="size-12 shrink-0 border-2 border-ink bg-white text-[22px] font-extrabold"
          >
            −
          </button>
          <div className="flex min-w-0 items-baseline justify-center">
            <input
              aria-label={`Distance in ${distanceUnit}`}
              aria-invalid={Boolean(errors.distanceM)}
              aria-describedby={errId("distanceM")}
              inputMode="decimal"
              placeholder="0.0"
              value={form.distance}
              onChange={(e) => set("distance", e.target.value)}
              className="w-[4.5ch] min-w-0 bg-transparent text-center font-display text-[50px] leading-none font-extrabold outline-none placeholder:text-rule focus-visible:bg-yellow/40"
            />
            <span className="text-sm font-extrabold">{unit}</span>
          </div>
          <button
            type="button"
            aria-label="More distance"
            onClick={() => set("distance", stepDistance(form.distance, 0.1))}
            className="size-12 shrink-0 border-2 border-ink bg-white text-[22px] font-extrabold"
          >
            +
          </button>
        </div>
        <FieldError id={errId("distanceM")} message={errors.distanceM} />

        <Dashed className="my-3.5" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1">
            <label htmlFor="duration" className={labelClass}>
              DURATION
            </label>
            <input
              id="duration"
              inputMode="numeric"
              placeholder="31:04"
              value={form.duration}
              aria-invalid={Boolean(errors.durationSec)}
              aria-describedby={errId("durationSec")}
              onChange={(e) => set("duration", e.target.value)}
              className={inputClass}
            />
            <FieldError id={errId("durationSec")} message={errors.durationSec} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="start-time" className={labelClass}>
              TIME
            </label>
            <input
              id="start-time"
              type="time"
              value={form.startTime}
              onChange={(e) => set("startTime", e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="date" className={labelClass}>
              DATE
            </label>
            <input
              id="date"
              type="date"
              value={form.date}
              aria-invalid={Boolean(errors.date)}
              aria-describedby={errId("date")}
              onChange={(e) => set("date", e.target.value)}
              className={`${inputClass} text-sm`}
            />
            <FieldError id={errId("date")} message={errors.date} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="hr" className={labelClass}>
              AVG HEART RATE
            </label>
            <div className="relative">
              <input
                id="hr"
                inputMode="numeric"
                placeholder="—"
                value={form.avgHeartRate}
                aria-invalid={Boolean(errors.avgHeartRate)}
                aria-describedby={errId("avgHeartRate")}
                onChange={(e) => set("avgHeartRate", e.target.value)}
                className={`${inputClass} pr-12`}
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] font-extrabold text-muted">
                BPM
              </span>
            </div>
            <FieldError id={errId("avgHeartRate")} message={errors.avgHeartRate} />
          </div>
        </div>
        <p className="mt-2.5 flex justify-between font-extrabold" aria-live="polite">
          <span className="text-muted">PACE</span>
          <span data-testid="pace">{pace === "—" ? "—" : pace.toUpperCase()}</span>
        </p>

        <Dashed className="mt-3.5 mb-2" />
        <FeelPicker value={form.feel} onChange={(f) => set("feel", f)} />

        <Dashed className="mt-2.5 mb-2" />
        <label htmlFor="notes" className={labelClass}>
          COMMENTS
        </label>
        <textarea
          id="notes"
          rows={2}
          maxLength={2000}
          value={form.notes}
          placeholder="hills, headwind, new shoes…"
          onChange={(e) => set("notes", e.target.value)}
          className="mt-1 w-full border-2 border-ink bg-white p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue"
        />
        <FieldError message={errors.notes} />

        {mode === "new" ? (
          <>
            <Dashed className="mt-2.5 mb-1.5" />
            <RegularOffer regular={regular} changed={changed} offer={offer} />
          </>
        ) : null}

        <Dashed className="my-2" />
        <div className="flex justify-between text-sm font-extrabold">
          <span>
            {word.toUpperCase()} {distanceNum ? `${distanceNum} ${unit}` : ""}
          </span>
          <span>{formatMinutes(durationSec)}</span>
        </div>
        <div className="text-[11px] text-muted">{form.feel ? `FELT ${FEEL_LABEL[form.feel]}` : "FEEL NOT RUNG UP"}</div>
        {formError ? (
          <p role="alert" className="mt-3 border-2 border-red px-2.5 py-2 font-extrabold text-red">
            {formError}
          </p>
        ) : null}
      </form>

      <PrintBar>
        <button type="submit" form="cardio-slip" disabled={saving} className={printButtonClass}>
          <PrinterIcon />
          {saving ? "PRINTING…" : mode === "edit" ? "REPRINT RECEIPT" : "PRINT RECEIPT"}
        </button>
      </PrintBar>
    </main>
  );
}
