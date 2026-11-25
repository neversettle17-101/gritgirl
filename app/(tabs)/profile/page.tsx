import { Suspense } from "react";
import { TornEdge } from "@/components/ledger/ledger-shell";
import { BodyWeightCard } from "@/components/profile/body-weight-card";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { SignedInAs } from "@/components/signed-in-as";
import { requirePageSession } from "@/lib/activities/page-data";
import { ageOn, formatBodyWeight, formatHeight, heightUnitFor } from "@/lib/domain/profile";
import { getProfile, listBodyWeights } from "@/lib/profile/repo";

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="truncate font-extrabold" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

async function ProfileBody() {
  const { supabase, prefs } = await requirePageSession();
  const [profile, weights] = await Promise.all([getProfile(supabase), listBodyWeights(supabase)]);
  if (profile.error || weights.error) throw new Error("Could not load your profile");

  const p = profile.data;
  const latest = weights.data[0];

  return (
    <>
      <h1 className="mt-2.5 font-display text-[44px] leading-[0.95] font-extrabold tracking-tight text-white">
        {p.displayName ? (
          <>
            Hi,
            <br />
            <span className="break-words">{p.displayName}</span>
          </>
        ) : (
          <>
            Your
            <br />
            profile
          </>
        )}
      </h1>

      <div className="mt-5 -rotate-[0.6deg]">
        <dl className="bg-paper px-4 pt-3.5 pb-3 text-xs leading-[1.9] text-ink shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
          <Row label="NAME" value={p.displayName ?? "—"} testId="profile-name" />
          <Row label="HEIGHT" value={formatHeight(p.heightCm, heightUnitFor(p.distanceUnit))} testId="profile-height" />
          <Row label="BODY WEIGHT" value={latest ? formatBodyWeight(latest.weightKg, p.weightUnit) : "—"} />
          <Row label="AGE" value={p.dateOfBirth ? String(ageOn(p.dateOfBirth, prefs.today)) : "—"} />
        </dl>
        <TornEdge />
      </div>

      <div className="mt-5 flex flex-col gap-5">
        <BodyWeightCard entries={weights.data} unit={p.weightUnit} today={prefs.today} />
        <ProfileEditor profile={p} today={prefs.today} />
      </div>
    </>
  );
}

export default function ProfilePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-5 pt-14 pb-32">
      <div className="flex items-center justify-between text-xs font-semibold tracking-[0.06em] text-white">
        <span className="font-extrabold">GRIT GIRL</span>
        <span>MEMBER CARD</span>
      </div>
      <Suspense fallback={<div aria-busy="true" className="mt-28 h-[420px] animate-pulse bg-paper/40" />}>
        <ProfileBody />
      </Suspense>
      <section className="receipt mt-6 p-3">
        <Suspense fallback={<p className="text-xs">…</p>}>
          <SignedInAs />
        </Suspense>
      </section>
    </main>
  );
}
