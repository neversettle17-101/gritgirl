"use client";

import { useActionState } from "react";
import { sendMagicLink, type SignInState } from "./actions";

const initial: SignInState = { status: "idle" };

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === "sent") {
    return (
      <p role="status" className="text-sm leading-relaxed">
        Link sent to <strong>{state.email}</strong>. Check your inbox and tap it to sign in.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label htmlFor="email" className="text-[10px] font-extrabold tracking-[0.1em] text-muted">
        EMAIL
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className="border border-ink bg-paper px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue"
      />
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 bg-ink px-4 py-3 text-sm font-extrabold tracking-[0.08em] text-paper disabled:opacity-60"
      >
        {pending ? "SENDING…" : "EMAIL ME A LINK →"}
      </button>
    </form>
  );
}
