import { Suspense } from "react";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/safe-next";
import { signInWithGoogle } from "./actions";
import { SignInForm } from "./sign-in-form";

const ERRORS: Record<string, string> = {
  auth: "That sign-in link is invalid or has expired. Request a new one.",
  oauth: "Google sign-in failed. Try again or use an email link.",
  google_disabled: "Google sign-in is not enabled here.",
};

async function SignInBody({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : undefined;
  const next = rawNext ? safeNextPath(rawNext) : undefined;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const googleEnabled = publicEnv().NEXT_PUBLIC_AUTH_GOOGLE_ENABLED;

  return (
    <>
      {errorKey && ERRORS[errorKey] ? (
        <p role="alert" className="mb-4 border border-red px-3 py-2 text-sm text-red">
          {ERRORS[errorKey]}
        </p>
      ) : null}
      <SignInForm next={next} />
      {googleEnabled ? (
        <form action={signInWithGoogle} className="mt-4 border-t border-dashed border-ink pt-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <button
            type="submit"
            className="w-full border border-ink px-4 py-3 text-sm font-extrabold tracking-[0.08em]"
          >
            CONTINUE WITH GOOGLE
          </button>
        </form>
      ) : null}
    </>
  );
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-14">
      <p className="text-xs font-extrabold tracking-[0.06em] text-paper">GRIT GIRL</p>
      <h1 className="mt-2 font-display text-4xl leading-[0.98] font-extrabold tracking-tight text-paper">
        Sign in to
        <br />
        open the till.
      </h1>
      <section className="receipt mt-6 p-5">
        <Suspense fallback={<p className="text-sm">Loading…</p>}>
          <SignInBody searchParams={props.searchParams} />
        </Suspense>
      </section>
    </main>
  );
}
