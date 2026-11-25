"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Dashed, FieldError, inputClass, labelClass } from "@/components/ui";
import { ApiError, updateProfile } from "@/lib/client/api";
import {
  dobProblem,
  heightToForm,
  heightUnitFor,
  parseHeight,
  PROFILE_LIMITS,
  type AboutForm,
  type Profile,
  type WeekStartsOn,
} from "@/lib/domain/profile";
import type { DistanceUnit, WeightUnit } from "@/lib/domain/units";

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

interface Form extends AboutForm {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  weekStartsOn: WeekStartsOn;
}

function toForm(p: Profile): Form {
  return {
    displayName: p.displayName ?? "",
    ...heightToForm(p.heightCm, heightUnitFor(p.distanceUnit)),
    dateOfBirth: p.dateOfBirth ?? "",
    weightUnit: p.weightUnit,
    distanceUnit: p.distanceUnit,
    weekStartsOn: p.weekStartsOn,
  };
}

/** Two-way choice drawn as receipt tick boxes. */
function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      <div className="mt-1.5 flex gap-2">
        {options.map((o) => (
          <label
            key={o}
            className={`flex h-11 flex-1 cursor-pointer items-center justify-center border-2 border-ink text-sm font-extrabold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue ${
              value === o ? "bg-ink text-white" : "bg-white text-ink"
            }`}
          >
            <input
              type="radio"
              name={legend}
              value={o}
              className="sr-only"
              checked={value === o}
              onChange={() => onChange(o)}
            />
            {o.toUpperCase()}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
        {hint ? <span className="font-semibold"> · {hint}</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** About you (name, height, date of birth) and unit / week settings, saved together. */
export function ProfileEditor({ profile, today }: { profile: Profile; today: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => toForm(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const heightUnit = heightUnitFor(form.distanceUnit);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setStatus(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  /** Switching km ↔ mi re-expresses the height already typed (cm ↔ ft/in). */
  function setDistanceUnit(unit: DistanceUnit) {
    setStatus(null);
    setForm((f) => {
      const h = parseHeight(f.heightMain, f.heightInches, heightUnitFor(f.distanceUnit));
      const height = h.ok ? heightToForm(h.value, heightUnitFor(unit)) : { heightMain: "", heightInches: "" };
      return { ...f, distanceUnit: unit, ...height };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    const errs: Record<string, string> = {};
    const height = parseHeight(form.heightMain, form.heightInches, heightUnit);
    if (!height.ok) errs.heightCm = height.error;
    const dob = form.dateOfBirth || null;
    const dobErr = dob ? dobProblem(dob, today) : null;
    if (dobErr) errs.dateOfBirth = dobErr;
    if (form.displayName.trim().length > PROFILE_LIMITS.displayName) {
      errs.displayName = `Keep it under ${PROFILE_LIMITS.displayName} characters`;
    }
    setErrors(errs);
    if (Object.keys(errs).length || !height.ok) return;

    setSaving(true);
    try {
      const saved = await updateProfile({
        displayName: form.displayName.trim() || null,
        heightCm: height.value,
        dateOfBirth: dob,
        weightUnit: form.weightUnit,
        distanceUnit: form.distanceUnit,
        weekStartsOn: form.weekStartsOn,
      });
      setForm(toForm(saved));
      setStatus({ kind: "saved", text: "SAVED · THANK YOU, COME AGAIN" });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setStatus({ kind: "error", text: err.message });
      } else {
        setStatus({ kind: "error", text: "Something went wrong. Try again." });
      }
    } finally {
      setSaving(false);
    }
  }

  const invalid = (k: string) => (errors[k] ? true : undefined);
  const describedBy = (k: string) => (errors[k] ? `err-${k}` : undefined);

  return (
    <form onSubmit={submit} noValidate aria-labelledby="about-heading" className="bg-paper px-4 py-4 text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
      <h2 id="about-heading" className="text-[13px] font-extrabold tracking-[0.1em]">
        ABOUT YOU
      </h2>
      <p className="mt-0.5 text-[11px] text-muted">All optional. Only you can see these.</p>
      <Dashed className="mt-2.5 mb-3" />

      <div className="flex flex-col gap-3.5">
        <Field label="NAME" htmlFor="displayName">
          <input
            id="displayName"
            className={inputClass}
            value={form.displayName}
            maxLength={PROFILE_LIMITS.displayName}
            autoComplete="nickname"
            onChange={(e) => set("displayName", e.target.value)}
            aria-invalid={invalid("displayName")}
            aria-describedby={describedBy("displayName")}
          />
          <FieldError id="err-displayName" message={errors.displayName} />
        </Field>

        {heightUnit === "cm" ? (
          <Field label="HEIGHT" htmlFor="heightMain" hint="CM">
            <input
              id="heightMain"
              className={inputClass}
              inputMode="decimal"
              value={form.heightMain}
              onChange={(e) => set("heightMain", e.target.value)}
              aria-invalid={invalid("heightCm")}
              aria-describedby={describedBy("heightCm")}
            />
          </Field>
        ) : (
          <fieldset>
            <legend className={labelClass}>HEIGHT</legend>
            <div className="mt-1.5 flex gap-2">
              <label className="flex flex-1 items-center gap-1.5 text-xs font-extrabold">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  aria-label="Height, feet"
                  value={form.heightMain}
                  onChange={(e) => set("heightMain", e.target.value)}
                  aria-invalid={invalid("heightCm")}
                  aria-describedby={describedBy("heightCm")}
                />
                FT
              </label>
              <label className="flex flex-1 items-center gap-1.5 text-xs font-extrabold">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  aria-label="Height, inches"
                  value={form.heightInches}
                  onChange={(e) => set("heightInches", e.target.value)}
                  aria-invalid={invalid("heightCm")}
                  aria-describedby={describedBy("heightCm")}
                />
                IN
              </label>
            </div>
          </fieldset>
        )}
        <FieldError id="err-heightCm" message={errors.heightCm} />

        <Field label="DATE OF BIRTH" htmlFor="dateOfBirth">
          <input
            id="dateOfBirth"
            type="date"
            className={inputClass}
            min={PROFILE_LIMITS.dobMin}
            max={today}
            value={form.dateOfBirth}
            onChange={(e) => set("dateOfBirth", e.target.value)}
            aria-invalid={invalid("dateOfBirth")}
            aria-describedby={describedBy("dateOfBirth")}
          />
          <FieldError id="err-dateOfBirth" message={errors.dateOfBirth} />
        </Field>
      </div>

      <h2 className="mt-5 text-[13px] font-extrabold tracking-[0.1em]">HOW WE RING IT UP</h2>
      <Dashed className="mt-2.5 mb-3" />
      <div className="flex flex-col gap-3.5">
        <Choice legend="WEIGHTS IN" value={form.weightUnit} options={["kg", "lb"] as const} onChange={(v) => set("weightUnit", v)} />
        <Choice legend="DISTANCES IN" value={form.distanceUnit} options={["km", "mi"] as const} onChange={setDistanceUnit} />
        <Field label="WEEK STARTS ON" htmlFor="weekStartsOn">
          <select
            id="weekStartsOn"
            className={inputClass}
            value={form.weekStartsOn}
            onChange={(e) => set("weekStartsOn", Number(e.target.value) as WeekStartsOn)}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="mt-5 flex h-12 w-full items-center justify-center bg-ink text-sm font-extrabold tracking-[0.06em] text-white disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2"
      >
        {saving ? "SAVING…" : "SAVE DETAILS"}
      </button>
      <p role="status" className={`mt-2 min-h-4 text-[11px] font-extrabold ${status?.kind === "error" ? "text-red" : ""}`}>
        {status?.text ?? ""}
      </p>
    </form>
  );
}
