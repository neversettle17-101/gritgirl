import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ScreenHeader } from "@/components/cycle/slip";
import { afterOnboardingPath } from "@/lib/cycle/onboarding";
import { currentCycleRepo } from "@/lib/cycle/server";
import { userToday } from "@/lib/cycle/service";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Welcome · Grit Girl" };

async function OnboardingBody({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const params = await searchParams;
  const next = afterOnboardingPath(typeof params.next === "string" ? params.next : null);
  const ctx = await currentCycleRepo();
  if (!ctx) redirect("/sign-in?next=%2Fonboarding");
  const settings = await ctx.repo.getSettings();
  if (settings?.onboarded) redirect(next);

  return (
    <OnboardingForm
      next={next}
      today={userToday(settings ?? { timezone: "UTC" })}
      defaults={{
        displayName: settings?.displayName ?? "",
        weightUnit: settings?.weightUnit ?? "kg",
        distanceUnit: settings?.distanceUnit ?? "km",
        defaultCycleLen: settings?.defaultCycleLen ?? 28,
        defaultPeriodLen: settings?.defaultPeriodLen ?? 5,
        cyclePredictionsOn: settings?.cyclePredictionsOn ?? true,
        lastPeriodStart: settings?.lastPeriodStart ?? "",
      }}
    />
  );
}

export default function OnboardingPage(props: PageProps<"/onboarding">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-13 pb-10">
      <ScreenHeader kicker="GRIT GIRL" right="NEW ACCOUNT" title={<>Open a<br />tab with us</>} />
      <Suspense fallback={<p className="mt-6 text-xs text-paper">Loading…</p>}>
        <OnboardingBody searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
