import { Suspense } from "react";
import { SignedInAs } from "@/components/signed-in-as";
import { ScreenHeader, Slip } from "@/components/cycle/slip";
import { requireOnboarded } from "@/lib/cycle/server";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings · Grit Girl" };

async function SettingsBody() {
  const { settings } = await requireOnboarded("/settings");
  return <SettingsForm initial={settings} />;
}

export default function SettingsPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-13 pb-10">
      <ScreenHeader backHref="/" right="HOUSE RULES" title={<>Settings</>} />
      <Suspense fallback={<p className="mt-6 text-xs text-paper">Loading…</p>}>
        <SettingsBody />
      </Suspense>
      <Slip>
        <Suspense fallback={<p className="text-xs">…</p>}>
          <SignedInAs />
        </Suspense>
      </Slip>
    </main>
  );
}
