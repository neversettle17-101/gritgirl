"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FieldError, inputClass, labelClass } from "@/components/ui";
import { ApiError, replaceTemplate, upsertTemplate } from "@/lib/client/api";
import type { TemplateDetail } from "@/lib/domain/template-types";
import { activityToTemplatePayload, regularNameError } from "@/lib/domain/templates";
import type { CardioActivityInput, StrengthActivityInput } from "@/lib/validation/activities";
import { uuid } from "@/lib/uuid";

/** Slip-side Regulars (mockups 5 and 6): the banner, the two offers, and saving them. */

export type RegularAction = "update" | "new" | null;

/** "FROM REGULAR: THE 5K · SWAP" at the top of a slip started from a regular. */
export function FromRegularBanner({ name }: { name: string }) {
  return (
    <div className="-mx-1 mb-3 flex items-center justify-between gap-2 bg-yellow px-2.5 py-2 text-[11px] text-ink">
      <span>
        FROM REGULAR: <strong className="uppercase">{name}</strong>
      </span>
      <Link href="/regulars" className="font-extrabold underline underline-offset-2">
        SWAP
      </Link>
    </div>
  );
}

function Tick({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex min-h-9 w-full items-center gap-2.5 text-left text-[13px] font-extrabold text-ink"
    >
      <span className="flex size-4 shrink-0 items-center justify-center border-2 border-ink text-xs leading-none">
        {on ? "X" : ""}
      </span>
      <span>{children}</span>
    </button>
  );
}

/**
 * The slip state for the offers, and `apply`, which saves the regular (if
 * ticked) right before the activity and returns the templateId the activity
 * should carry. The new regular's id is made once, so a retry after a failed
 * activity save updates the same regular instead of making a second one.
 */
export function useRegularOffer(regular: TemplateDetail | undefined, changed: boolean) {
  const [action, setAction] = useState<RegularAction>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const newId = useRef<string | null>(null);

  // "Update" only applies while the slip still differs from the regular.
  const effective: RegularAction = action === "update" && (!regular || !changed) ? null : action;

  /** Null when the ticked offer cannot go ahead (the error is shown). */
  function check(): boolean {
    if (effective !== "new") return true;
    const e = regularNameError(name);
    setError(e);
    return e === null;
  }

  async function apply(
    payload: CardioActivityInput | StrengthActivityInput,
  ): Promise<{ ok: true; templateId: string | null } | { ok: false; message: string }> {
    try {
      if (effective === "new") {
        newId.current ??= uuid();
        await upsertTemplate(activityToTemplatePayload(payload, { id: newId.current, name }));
        return { ok: true, templateId: newId.current };
      }
      if (effective === "update" && regular) {
        await replaceTemplate(
          activityToTemplatePayload(payload, { id: regular.id, name: regular.name, notes: regular.notes }),
        );
      }
      return { ok: true, templateId: payload.templateId };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong. Try again.";
      if (err instanceof ApiError && err.fields.name) setError(err.fields.name);
      return { ok: false, message: `The regular was not saved: ${message}` };
    }
  }

  return { action: effective, setAction, name, setName, error, setError, check, apply };
}

export function RegularOffer({
  regular,
  changed,
  offer,
}: {
  regular: TemplateDetail | undefined;
  changed: boolean;
  offer: ReturnType<typeof useRegularOffer>;
}) {
  const { action, setAction, name, setName, error, setError } = offer;
  const pick = (a: Exclude<RegularAction, null>) => {
    setError(null);
    setAction(action === a ? null : a);
  };
  return (
    <div className="flex flex-col">
      {regular && changed ? (
        <Tick on={action === "update"} onClick={() => pick("update")}>
          UPDATE REGULAR &ldquo;<span className="uppercase">{regular.name}</span>&rdquo;
        </Tick>
      ) : null}
      <Tick on={action === "new"} onClick={() => pick("new")}>
        SAVE AS A NEW REGULAR
      </Tick>
      {action === "new" ? (
        <div className="mt-1 flex flex-col gap-1">
          <label htmlFor="regular-name" className={labelClass}>
            NAME
          </label>
          <input
            id="regular-name"
            value={name}
            maxLength={80}
            placeholder="Upper Body B"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "err-regular-name" : undefined}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <FieldError id="err-regular-name" message={error ?? undefined} />
        </div>
      ) : null}
    </div>
  );
}
