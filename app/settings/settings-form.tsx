"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Choice, PrimaryButton, Stepper, TextField, Tick } from "@/components/cycle/controls";
import { DISCLAIMER, Label, Rule, Slip } from "@/components/cycle/slip";
import { putJson } from "@/lib/cycle/client-api";
import type { Settings } from "@/lib/cycle/service";
import { MAX_CYCLE_LEN, MAX_PERIOD_LEN, MIN_CYCLE_LEN } from "@/lib/domain/cycle";
import { fieldErrors, settingsPutBody } from "@/lib/validation/cycle";

type Editable = Omit<Settings, "onboarded" | "displayName" | "lastPeriodStart"> & {
  displayName: string;
  lastPeriodStart: string;
};

function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

export function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const start: Editable = {
    ...initial,
    displayName: initial.displayName ?? "",
    lastPeriodStart: initial.lastPeriodStart ?? "",
  };
  const [v, setV] = useState(start);
  const [saved, setSaved] = useState(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const zones = useMemo(() => timeZones(initial.timezone), [initial.timezone]);
  const set = <K extends keyof Editable>(k: K, value: Editable[K]) => {
    setStatus(null);
    setV((s) => ({ ...s, [k]: value }));
  };
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(v) as (keyof Editable)[]) {
      if (v[k] !== saved[k]) patch[k] = v[k];
    }
    if ("displayName" in patch) patch.displayName = v.displayName.trim() || null;
    if ("lastPeriodStart" in patch) patch.lastPeriodStart = v.lastPeriodStart || null;
    const parsed = settingsPutBody.safeParse(patch);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await putJson<{ settings: Settings }>("/api/settings", parsed.data);
      if (!res.ok) {
        setErrors(res.error.fields ?? {});
        setStatus({ kind: "error", text: res.error.message });
        return;
      }
      const s = res.data.settings;
      const next = { ...s, displayName: s.displayName ?? "", lastPeriodStart: s.lastPeriodStart ?? "" };
      setV(next);
      setSaved(next);
      setStatus({ kind: "ok", text: "SAVED. RECEIPT UPDATED." });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Settings">
      <Slip tilt={-0.6} torn>
        <p className="text-[11px] font-extrabold tracking-[0.1em] text-muted">YOU</p>
        <div className="mt-3">
          <TextField
            id="st-name"
            label="NAME"
            value={v.displayName}
            maxLength={60}
            onChange={(e) => set("displayName", e.target.value)}
            error={errors.displayName}
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
        <div className="mt-3">
          <Choice
            name="weekStartsOn"
            label="WEEK STARTS ON"
            value={v.weekStartsOn}
            options={[{ value: 1, label: "MON" }, { value: 0, label: "SUN" }]}
            onChange={(x) => set("weekStartsOn", x)}
          />
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor="st-tz">TIME ZONE</Label>
          <select
            id="st-tz"
            value={v.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            className="h-11 w-full border-2 border-ink bg-white px-2 text-sm font-extrabold"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          {errors.timezone ? <p className="text-[11px] font-extrabold text-red">{errors.timezone}</p> : null}
        </div>
      </Slip>

      <Slip tilt={0.6} torn>
        <p className="text-[11px] font-extrabold tracking-[0.1em] text-muted">CYCLE</p>
        <div className="mt-3">
          <Tick id="st-track-only" checked={!v.cyclePredictionsOn} onChange={(x) => set("cyclePredictionsOn", !x)}>
            TRACK PERIODS ONLY (NO PHASE PREDICTIONS)
          </Tick>
        </div>
        <Rule />
        <Stepper
          id="st-cycle-len"
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
            id="st-period-len"
            label="TYPICAL PERIOD LENGTH"
            unit="DAYS"
            min={1}
            max={MAX_PERIOD_LEN}
            value={v.defaultPeriodLen}
            onChange={(x) => set("defaultPeriodLen", x)}
            error={errors.defaultPeriodLen}
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Used until you have logged a few periods; after that your own averages take over.
        </p>
        <Rule />
        <TextField
          id="st-last-period"
          label="LAST PERIOD STARTED (USED ONLY UNTIL YOU LOG ONE)"
          type="date"
          value={v.lastPeriodStart}
          onChange={(e) => set("lastPeriodStart", e.target.value)}
          error={errors.lastPeriodStart}
        />
        <p className="mt-3 text-[11px] leading-relaxed">{DISCLAIMER}</p>
      </Slip>

      <div className="mt-6" aria-live="polite">
        {status ? (
          <p
            role={status.kind === "error" ? "alert" : "status"}
            className={`mb-3 border-2 bg-paper px-3 py-2 text-xs font-extrabold ${
              status.kind === "error" ? "border-red text-red" : "border-ink text-ink"
            }`}
          >
            {status.text}
          </p>
        ) : null}
        <PrimaryButton type="submit" pending={pending} disabled={!dirty}>
          {pending ? "SAVING…" : dirty ? "SAVE CHANGES" : "ALL SAVED"}
        </PrimaryButton>
      </div>
    </form>
  );
}
