"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Choice, PrimaryButton, Stepper, TextField, Tick } from "@/components/cycle/controls";
import { DISCLAIMER, Label, Rule, Slip } from "@/components/cycle/slip";
import { putJson } from "@/lib/cycle/client-api";
import { MAX_CYCLE_LEN, MAX_PERIOD_LEN, MIN_CYCLE_LEN } from "@/lib/domain/cycle";
import { isValidTimeZone } from "@/lib/domain/dates";
import { fieldErrors, onboardingBody } from "@/lib/validation/cycle";

interface Defaults {
  displayName: string;
  weightUnit: "kg" | "lb";
  distanceUnit: "km" | "mi";
  defaultCycleLen: number;
  defaultPeriodLen: number;
  cyclePredictionsOn: boolean;
  lastPeriodStart: string;
}

export function OnboardingForm({ defaults, next, today }: { defaults: Defaults; next: string; today: string }) {
  const router = useRouter();
  const [v, setV] = useState(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Defaults>(k: K, value: Defaults[K]) => setV((s) => ({ ...s, [k]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parsed = onboardingBody.safeParse({
      ...v,
      lastPeriodStart: v.lastPeriodStart || null,
      timezone: browserTz && isValidTimeZone(browserTz) ? browserTz : undefined,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    if (parsed.data.lastPeriodStart && parsed.data.lastPeriodStart > today) {
      setErrors({ lastPeriodStart: "That date is in the future" });
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await putJson("/api/settings", { ...parsed.data, completeOnboarding: true });
      if (!res.ok) {
        setErrors(res.error.fields ?? {});
        setFormError(res.error.message);
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Onboarding">
      <Slip tilt={-0.6} torn>
        <p className="text-[11px] font-extrabold tracking-[0.1em] text-muted">NEW CUSTOMER SLIP</p>
        <div className="mt-3">
          <TextField
            id="ob-name"
            label="NAME ON THE TAB"
            autoComplete="given-name"
            value={v.displayName}
            maxLength={60}
            onChange={(e) => set("displayName", e.target.value)}
            error={errors.displayName}
            required
          />
        </div>
        <Rule />
        <div className="grid grid-cols-2 gap-3">
          <Choice
            name="weightUnit"
            label="WEIGHT"
            value={v.weightUnit}
            options={[{ value: "kg", label: "KG" }, { value: "lb", label: "LB" }]}
            onChange={(x) => set("weightUnit", x)}
          />
          <Choice
            name="distanceUnit"
            label="DISTANCE"
            value={v.distanceUnit}
            options={[{ value: "km", label: "KM" }, { value: "mi", label: "MI" }]}
            onChange={(x) => set("distanceUnit", x)}
          />
        </div>
      </Slip>

      <Slip tilt={0.6} torn>
        <p className="text-[11px] font-extrabold tracking-[0.1em] text-muted">CYCLE · OPTIONAL BUT HANDY</p>
        <div className="mt-3">
          <TextField
            id="ob-last-period"
            label="LAST PERIOD STARTED (IF YOU KNOW)"
            type="date"
            max={today}
            value={v.lastPeriodStart}
            onChange={(e) => set("lastPeriodStart", e.target.value)}
            error={errors.lastPeriodStart}
          />
        </div>
        <Rule />
        <Stepper
          id="ob-cycle-len"
          label="TYPICAL CYCLE LENGTH"
          unit="DAYS"
          min={MIN_CYCLE_LEN}
          max={MAX_CYCLE_LEN}
          value={v.defaultCycleLen}
          onChange={(x) => set("defaultCycleLen", x)}
          error={errors.defaultCycleLen}
        />
        <div className="mt-3">
          <Stepper
            id="ob-period-len"
            label="TYPICAL PERIOD LENGTH"
            unit="DAYS"
            min={1}
            max={MAX_PERIOD_LEN}
            value={v.defaultPeriodLen}
            onChange={(x) => set("defaultPeriodLen", x)}
            error={errors.defaultPeriodLen}
          />
        </div>
        <Rule />
        <Tick id="ob-track-only" checked={!v.cyclePredictionsOn} onChange={(x) => set("cyclePredictionsOn", !x)}>
          TRACK PERIODS ONLY (NO PHASE PREDICTIONS)
        </Tick>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Handy for irregular cycles or hormonal birth control. You can change this any time in settings.
        </p>
        <Rule />
        <Label>THE SMALL PRINT</Label>
        <p className="mt-1 text-[11px] leading-relaxed" data-testid="disclaimer">
          {DISCLAIMER} Cycle data stays private to your account.
        </p>
      </Slip>

      {formError ? (
        <p role="alert" className="mt-4 border-2 border-red bg-paper px-3 py-2 text-xs font-extrabold text-red">
          {formError}
        </p>
      ) : null}
      <div className="mt-6">
        <PrimaryButton type="submit" pending={pending}>
          {pending ? "OPENING YOUR TAB…" : "OPEN MY TAB"}
        </PrimaryButton>
      </div>
    </form>
  );
}
