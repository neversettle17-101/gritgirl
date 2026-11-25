import { describe, expect, it } from "vitest";
import { afterOnboardingPath, onboardingRedirect, onboardingUrl } from "@/lib/cycle/onboarding";

describe("onboarding redirect", () => {
  it("sends users who have not onboarded to /onboarding, keeping where they were going", () => {
    expect(onboardingRedirect({ onboarded: false }, "/")).toBe("/onboarding");
    expect(onboardingRedirect({ onboarded: false }, "/cycle")).toBe("/onboarding?next=%2Fcycle");
    expect(onboardingRedirect({ onboarded: false }, "/cycle?month=2026-10")).toBe(
      "/onboarding?next=%2Fcycle%3Fmonth%3D2026-10",
    );
    // A missing settings row counts as not onboarded.
    expect(onboardingRedirect(null, "/settings")).toBe("/onboarding?next=%2Fsettings");
  });

  it("lets onboarded users through", () => {
    expect(onboardingRedirect({ onboarded: true }, "/cycle")).toBeNull();
    expect(onboardingRedirect({ onboarded: true }, "/")).toBeNull();
  });

  it("never redirects onboarding itself, auth pages or the API (no loops)", () => {
    for (const p of ["/onboarding", "/onboarding?next=/cycle", "/sign-in", "/auth/callback", "/api/settings"]) {
      expect(onboardingRedirect({ onboarded: false }, p), p).toBeNull();
    }
  });

  it("drops unsafe or looping next targets", () => {
    expect(onboardingUrl("//evil.example")).toBe("/onboarding");
    expect(onboardingUrl("https://evil.example/x")).toBe("/onboarding");
    expect(onboardingUrl("/onboarding")).toBe("/onboarding");
    expect(afterOnboardingPath("/cycle")).toBe("/cycle");
    expect(afterOnboardingPath("/onboarding")).toBe("/");
    expect(afterOnboardingPath("//evil.example")).toBe("/");
    expect(afterOnboardingPath(null)).toBe("/");
  });
});
