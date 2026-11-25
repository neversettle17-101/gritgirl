"use client";

import { useId } from "react";

/** Receipt-style form controls (2px ink borders, 44px+ tap targets). */

export function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  name,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  name: string;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend id={id} className="mb-1.5 text-[11px] font-extrabold tracking-[0.04em] text-muted">
        {label}
      </legend>
      <div className="flex" role="radiogroup" aria-labelledby={id}>
        {options.map((o, i) => {
          const checked = o.value === value;
          return (
            <label
              key={String(o.value)}
              className={`flex h-11 flex-1 cursor-pointer items-center justify-center border-2 border-ink text-sm font-extrabold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue ${
                i > 0 ? "-ml-0.5" : ""
              } ${checked ? "bg-ink text-paper" : "bg-white text-ink"}`}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                checked={checked}
                onChange={() => onChange(o.value)}
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  unit,
  onChange,
  id,
  error,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
  id: string;
  error?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-extrabold tracking-[0.04em] text-muted">
        {label}
      </label>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`Fewer days (${label.toLowerCase()})`}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          className="size-12 border-2 border-ink bg-white text-[22px] font-extrabold disabled:opacity-40"
        >
          −
        </button>
        <div className="flex items-baseline gap-1">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.round(n));
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="w-16 bg-transparent text-center font-display text-[40px] leading-none font-extrabold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-sm font-extrabold">{unit}</span>
        </div>
        <button
          type="button"
          aria-label={`More days (${label.toLowerCase()})`}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          className="size-12 border-2 border-ink bg-white text-[22px] font-extrabold disabled:opacity-40"
        >
          +
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-[11px] font-extrabold text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Checkbox drawn as the mockup's square tick box. */
export function Tick({
  checked,
  onChange,
  children,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-xs font-extrabold">
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="flex size-4 shrink-0 items-center justify-center border-2 border-ink text-[12px] leading-none peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue"
      >
        {checked ? "✕" : ""}
      </span>
      <span>{children}</span>
    </label>
  );
}

export function TextField({
  id,
  label,
  error,
  ...input
}: { id: string; label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-extrabold tracking-[0.04em] text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-11 w-full border-2 border-ink bg-white px-2.5 text-base font-extrabold text-ink"
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} className="text-[11px] font-extrabold text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PrimaryButton({
  children,
  pending,
  ...rest
}: { pending?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={pending || rest.disabled}
      className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-[14px] bg-ink text-[15px] font-extrabold tracking-[0.04em] text-white disabled:opacity-60 ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}
