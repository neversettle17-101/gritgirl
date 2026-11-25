"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Dashed, FieldError, inputClass, labelClass } from "@/components/ui";
import { ApiError, deleteBodyWeight, logBodyWeight } from "@/lib/client/api";
import { formatReceiptDate } from "@/lib/domain/dates";
import {
  formatBodyWeight,
  formatWeightChange,
  parseBodyWeight,
  PROFILE_LIMITS,
  type BodyWeightEntry,
} from "@/lib/domain/profile";
import type { WeightUnit } from "@/lib/domain/units";

/** Current body weight, a quick weigh-in, and the last few entries (latest first). */
export function BodyWeightCard({ entries, unit, today }: { entries: BodyWeightEntry[]; unit: WeightUnit; today: string }) {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [latest, previous] = entries;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    const parsed = parseBodyWeight(weight, unit);
    const errs: Record<string, string> = {};
    if (!parsed.ok) errs.weightKg = parsed.error;
    if (!date) errs.measuredOn = "Pick the date you weighed in";
    else if (date > today) errs.measuredOn = "That date hasn't happened yet";
    setErrors(errs);
    if (!parsed.ok || Object.keys(errs).length) return;

    setBusy(true);
    try {
      await logBodyWeight({ weightKg: parsed.value, measuredOn: date });
      setWeight("");
      setDate(today);
      setStatus("WEIGH-IN RUNG UP");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setStatus(err.message);
      } else setStatus("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: BodyWeightEntry) {
    setBusy(true);
    setStatus(null);
    try {
      await deleteBodyWeight(entry.id);
      setStatus(`VOIDED ${formatReceiptDate(entry.measuredOn)}`);
      router.refresh();
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="weight-heading" className="bg-paper px-4 py-4 text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
      <div className="flex items-baseline justify-between">
        <h2 id="weight-heading" className="text-[13px] font-extrabold tracking-[0.1em]">
          BODY WEIGHT
        </h2>
        {latest ? <span className="text-[11px] text-muted">AS OF {formatReceiptDate(latest.measuredOn)}</span> : null}
      </div>
      <Dashed className="mt-2.5 mb-3" />

      <div className="flex items-baseline justify-between">
        <span className="text-xs font-extrabold">CURRENT</span>
        <span className="font-display text-3xl font-extrabold" data-testid="current-weight">
          {latest ? formatBodyWeight(latest.weightKg, unit) : "NOT YET WEIGHED"}
        </span>
      </div>
      {latest && previous ? (
        <p className="text-right text-[11px] text-muted">
          {formatWeightChange(latest.weightKg, previous.weightKg, unit)} {unit.toUpperCase()} SINCE{" "}
          {formatReceiptDate(previous.measuredOn)}
        </p>
      ) : null}

      <form onSubmit={submit} noValidate className="mt-3.5 grid grid-cols-[1fr_1fr] gap-2" aria-label="Log a weigh-in">
        <div>
          <label htmlFor="bodyWeight" className={labelClass}>
            WEIGHT · {unit.toUpperCase()}
          </label>
          <input
            id="bodyWeight"
            className={`mt-1.5 ${inputClass}`}
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            aria-invalid={errors.weightKg ? true : undefined}
            aria-describedby={errors.weightKg ? "err-weightKg" : undefined}
          />
        </div>
        <div>
          <label htmlFor="weighedOn" className={labelClass}>
            DATE
          </label>
          <input
            id="weighedOn"
            type="date"
            className={`mt-1.5 ${inputClass} text-sm`}
            min={PROFILE_LIMITS.dobMin}
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={errors.measuredOn ? true : undefined}
            aria-describedby={errors.measuredOn ? "err-measuredOn" : undefined}
          />
        </div>
        <div className="col-span-2">
          <FieldError id="err-weightKg" message={errors.weightKg} />
          <FieldError id="err-measuredOn" message={errors.measuredOn} />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="col-span-2 flex h-12 items-center justify-center bg-ink text-sm font-extrabold tracking-[0.06em] text-white disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2"
        >
          LOG WEIGHT
        </button>
      </form>
      <p role="status" className="mt-2 min-h-4 text-[11px] font-extrabold">
        {status ?? ""}
      </p>

      {entries.length ? (
        <>
          <h3 className="mt-2 text-[11px] font-extrabold tracking-[0.08em] text-muted">RECENT WEIGH-INS</h3>
          <ul aria-label="Recent weigh-ins" className="mt-1">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between border-b border-dotted border-rule text-sm">
                <span>{formatReceiptDate(e.measuredOn)}{e.measuredOn.slice(0, 4) !== today.slice(0, 4) ? ` ${e.measuredOn.slice(0, 4)}` : ""}</span>
                <span className="flex items-center gap-1">
                  <span className="font-extrabold">{formatBodyWeight(e.weightKg, unit)}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(e)}
                    aria-label={`Delete weigh-in on ${formatReceiptDate(e.measuredOn)} ${e.measuredOn.slice(0, 4)}`}
                    className="flex size-11 items-center justify-center text-base font-extrabold text-muted hover:text-red disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
