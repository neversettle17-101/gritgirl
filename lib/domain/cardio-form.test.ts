import { describe, expect, it } from "vitest";
import { activityToCardioForm, cardioFormToPayload, newCardioForm, stepDistance } from "./cardio-form";
import { activityInputSchema } from "@/lib/validation/activities";

const ID = "11111111-1111-4111-8111-111111111111";
const form = (o = {}) => ({
  ...newCardioForm({ id: ID, type: "running", date: "2026-11-24", startTime: "07:15" }),
  duration: "31:04",
  distance: "5.2",
  avgHeartRate: "152",
  feel: "spicy" as const,
  ...o,
});

describe("cardio form", () => {
  it("maps to the SI document", () => {
    const r = cardioFormToPayload(form(), "km");
    expect(r).toEqual({
      ok: true,
      payload: {
        id: ID,
        type: "running",
        date: "2026-11-24",
        startTime: "07:15",
        durationSec: 1864,
        distanceM: 5200,
        avgHeartRate: 152,
        feel: "spicy",
        notes: null,
        templateId: null,
      },
    });
    expect(r.ok && activityInputSchema("2026-11-25").safeParse(r.payload).success).toBe(true);
  });

  it("converts miles", () => {
    const r = cardioFormToPayload(form({ distance: "3.1" }), "mi");
    expect(r.ok && r.payload.distanceM).toBe(4989);
  });

  it("allows blank distance and heart rate (a walk without a watch)", () => {
    const r = cardioFormToPayload(form({ type: "walking", distance: "", avgHeartRate: "" }), "km");
    expect(r.ok && r.payload).toMatchObject({ type: "walking", distanceM: null, avgHeartRate: null });
  });

  it("reports errors", () => {
    const r = cardioFormToPayload(form({ duration: "", distance: "lots", avgHeartRate: "300" }), "km");
    expect(r.ok).toBe(false);
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["avgHeartRate", "distanceM", "durationSec"]);
  });

  it("steps distance by 0.1 without float noise", () => {
    expect(stepDistance("5.2", 0.1)).toBe("5.3");
    expect(stepDistance("", 0.1)).toBe("0.1");
    expect(stepDistance("0.1", -0.1)).toBe("");
    expect(stepDistance("0.29", 0.1)).toBe("0.4");
  });

  it("round-trips a saved activity", () => {
    const f = activityToCardioForm(
      {
        id: ID,
        type: "walking",
        date: "2026-11-24",
        startTime: null,
        durationSec: 2100,
        distanceM: 3000,
        avgHeartRate: null,
        feel: null,
        notes: "sunset",
        templateId: null,
        createdAt: "",
        updatedAt: "",
        exercises: [],
      },
      "mi",
    );
    expect(f).toMatchObject({ type: "walking", duration: "35:00", distance: "1.86", notes: "sunset" });
  });
});
