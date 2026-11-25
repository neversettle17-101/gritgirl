import { getCurrentUser } from "@/lib/supabase/server";

/** Reads the session, so it must render inside a <Suspense> boundary. */
export async function SignedInAs() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="truncate">SIGNED IN AS {user.email ?? "YOU"}</span>
      <form action="/auth/sign-out" method="post">
        <button type="submit" className="font-extrabold underline underline-offset-2">
          SIGN OUT
        </button>
      </form>
    </div>
  );
}
