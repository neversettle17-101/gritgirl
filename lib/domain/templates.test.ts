import { describe, expect, it } from "vitest";
import type { LastSets } from "./activity-types";
import { cardioFormToPayload } from "./cardio-form";
import { addSet, draftToPayload, removeExercise } from "./strength-draft";
import type { TemplateDetail, TemplateExerciseDetail } from "./template-types";
import {
  activityToTemplatePayload,
  cardioFormDiffers,
  newRegularExercise,
  newRegularForm,
  regularFormToPayload,
  regularNameError,
  ringUpHref,
  strengthDraftDiffers,
  targetLine,
  targetSets,
  templateLines,
  templateTagline,
  templateToCardioForm,
  templateToRegularForm,
  templateToStrengthDraft,
} from "./templates";
import { templateInputSchema } from "@/lib/validation/templates";

const SLIP_ID = "11111111-1111-4111-8111-111111111111";
const TPL_ID = "44444444-4444-4444-8444-444444444444";
const NEW_TPL_ID = "55555555-5555-4555-8555-555555555555";
const SQUAT = { id: "22222222-2222-4222-8222-222222222222", name: "Barbell Squat", tracking: "reps" as const, custom: false };
const PLANK = { id: "33333333-3333-4333-8333-333333333333", name: "Plank", tracking: "time" as const, custom: false };
const KG = { distance: "km", weight: "kg" } as const;
const LB_MI = { distance: "mi", weight: "lb" } as const;

function keys() {
  let n = 0;
  return () => `k${++n}`;
}

function te(over: Partial<TemplateExerciseDetail> & Pick<TemplateExerciseDetail, "exercise">): TemplateExerciseDetail {
  return { id: "te", position: 1, targetSets: 3, targetReps: null, targetDurationSec: null, targetWeightKg: null, ...over };
}

function template(over: Partial<TemplateDetail> = {}): TemplateDetail {
  return {
    id: TPL_ID,
    type: "strength",
    name: "Leg Day",
    notes: null,
    targetDistanceM: null,
    targetDurationSec: null,
    archived: false,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    usedCount: 0,
    lastUsedOn: null,
    exercises: [],
    ...over,
  };
}

const legDay = template({
  exercises: [
    te({ exercise: SQUAT, targetSets: 3, targetReps: 10, targetWeightKg: 40 }),
    te({ exercise: PLANK, position: 2, targetSets: 2, targetDurationSec: 60 }),
  ],
});

const the5k = template({ type: "running", name: "The 5K", targetDistanceM: 5000, targetDurationSec: 1800 });

const draftOpts = { id: SLIP_ID, date: "2026-11-25", startTime: "07:15", weightUnit: "kg" as const };

describe("ring it up: strength pre-fill", () => {
  it("uses the template targets when an exercise was never logged", () => {
    const d = templateToStrengthDraft(legDay, {}, draftOpts, keys());
    expect(d.templateId).toBe(TPL_ID);
    expect(d.mode).toBe("new");
    expect(d.exercises.map((e) => e.name)).toEqual(["Barbell Squat", "Plank"]);
    expect(d.exercises[0]!.sets.map((s) => [s.reps, s.time, s.weight])).toEqual([
      ["10", "", "40"],
      ["10", "", "40"],
      ["10", "", "40"],
    ]);
    expect(d.exercises[1]!.sets.map((s) => [s.reps, s.time, s.weight])).toEqual([
      ["", "60", ""],
      ["", "60", ""],
    ]);
  });

  it("prefers the LAST logged session of each exercise over the targets", () => {
    const last: LastSets = {
      activityId: "a",
      date: "2026-11-20",
      sets: [
        { setNumber: 1, reps: 8, durationSec: null, weightKg: 45 },
        { setNumber: 2, reps: 6, durationSec: null, weightKg: 47.5 },
      ],
    };
    const d = templateToStrengthDraft(legDay, { [SQUAT.id]: last, [PLANK.id]: null }, draftOpts, keys());
    expect(d.exercises[0]!.sets.map((s) => [s.reps, s.weight])).toEqual([
      ["8", "45"],
      ["6", "47.5"],
    ]);
    // Plank: no history → targets.
    expect(d.exercises[1]!.sets).toHaveLength(2);
  });

  it("falls back to the targets when the last session has no sets", () => {
    const d = templateToStrengthDraft(legDay, { [SQUAT.id]: { activityId: "a", date: "x", sets: [] } }, draftOpts, keys());
    expect(d.exercises[0]!.sets).toHaveLength(3);
  });

  it("converts target kg to the user's unit", () => {
    const d = templateToStrengthDraft(legDay, {}, { ...draftOpts, weightUnit: "lb" }, keys());
    expect(d.exercises[0]!.sets[0]!.weight).toBe("88.2");
  });

  it("gives every exercise and set a unique key", () => {
    const d = templateToStrengthDraft(legDay, {}, draftOpts, keys());
    const all = d.exercises.flatMap((e) => [e.key, ...e.sets.map((s) => s.key)]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("is a valid activity once saved, linked to the template", () => {
    const r = draftToPayload(templateToStrengthDraft(legDay, {}, draftOpts, keys()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.templateId).toBe(TPL_ID);
  });

  it("targetSets repeats the targets", () => {
    expect(targetSets(legDay.exercises[1]!)).toEqual([
      { setNumber: 1, reps: null, durationSec: 60, weightKg: null },
      { setNumber: 2, reps: null, durationSec: 60, weightKg: null },
    ]);
  });
});

describe("ring it up: run / walk pre-fill", () => {
  it("fills distance and duration from the targets", () => {
    const f = templateToCardioForm(the5k, { id: SLIP_ID, date: "2026-11-25", startTime: "07:15" }, "km");
    expect(f).toMatchObject({ type: "running", distance: "5", duration: "30:00", templateId: TPL_ID, startTime: "07:15" });
    const r = cardioFormToPayload(f, "km");
    expect(r.ok && r.payload).toMatchObject({ distanceM: 5000, durationSec: 1800, templateId: TPL_ID });
  });

  it("converts to miles and leaves missing targets blank", () => {
    const stroll = template({ type: "walking", targetDistanceM: 3000, targetDurationSec: null });
    const f = templateToCardioForm(stroll, { id: SLIP_ID, date: "2026-11-25" }, "mi");
    expect(f).toMatchObject({ type: "walking", distance: "1.86", duration: "" });
  });
});

describe("slip → template", () => {
  it("strength: set count and first set become the targets", () => {
    let d = templateToStrengthDraft(legDay, {}, draftOpts, keys());
    d = addSet(d, d.exercises[0]!.key, "extra");
    const r = draftToPayload(d);
    if (!r.ok) throw new Error("draft invalid");
    const doc = activityToTemplatePayload(r.payload, { id: NEW_TPL_ID, name: "  Leg Day B " });
    expect(doc).toEqual({
      id: NEW_TPL_ID,
      name: "Leg Day B",
      notes: null,
      type: "strength",
      exercises: [
        { exerciseId: SQUAT.id, targetSets: 4, targetReps: 10, targetDurationSec: null, targetWeightKg: 40 },
        { exerciseId: PLANK.id, targetSets: 2, targetReps: null, targetDurationSec: 60, targetWeightKg: null },
      ],
    });
    expect(templateInputSchema.safeParse(doc).success).toBe(true);
  });

  it("cardio: distance and duration become the targets", () => {
    const f = { ...templateToCardioForm(the5k, { id: SLIP_ID, date: "2026-11-25" }, "km"), distance: "5.2", duration: "31:04" };
    const r = cardioFormToPayload(f, "km");
    if (!r.ok) throw new Error("form invalid");
    const doc = activityToTemplatePayload(r.payload, { id: TPL_ID, name: "The 5K", notes: "flat route" });
    expect(doc).toEqual({
      id: TPL_ID,
      name: "The 5K",
      notes: "flat route",
      type: "running",
      targetDistanceM: 5200,
      targetDurationSec: 1864,
    });
    expect(templateInputSchema.safeParse(doc).success).toBe(true);
  });

  it("checks the name", () => {
    expect(regularNameError("  ")).toMatch(/name/);
    expect(regularNameError("x".repeat(81))).toMatch(/80/);
    expect(regularNameError("Upper Body B")).toBeNull();
  });
});

describe("Update regular? (change detection)", () => {
  it("strength: unchanged until the exercises or set counts change", () => {
    const d = templateToStrengthDraft(legDay, {}, draftOpts, keys());
    expect(strengthDraftDiffers(d, legDay)).toBe(false);
    expect(strengthDraftDiffers(addSet(d, d.exercises[1]!.key, "x"), legDay)).toBe(true);
    expect(strengthDraftDiffers(removeExercise(d, d.exercises[0]!.key), legDay)).toBe(true);
    // Reordered exercises count as a change.
    expect(strengthDraftDiffers({ ...d, exercises: [...d.exercises].reverse() }, legDay)).toBe(true);
  });

  it("strength: different weights or reps alone are not a change (§7)", () => {
    const last: LastSets = { activityId: "a", date: "x", sets: targetSets(legDay.exercises[0]!).map((s) => ({ ...s, weightKg: 50 })) };
    const d = templateToStrengthDraft(legDay, { [SQUAT.id]: last }, draftOpts, keys());
    expect(strengthDraftDiffers(d, legDay)).toBe(false);
  });

  it("cardio: distance, duration or type differ from the targets", () => {
    const f = templateToCardioForm(the5k, { id: SLIP_ID, date: "2026-11-25" }, "km");
    expect(cardioFormDiffers(f, "km", the5k)).toBe(false);
    expect(cardioFormDiffers({ ...f, distance: "5.2" }, "km", the5k)).toBe(true);
    expect(cardioFormDiffers({ ...f, duration: "31:04" }, "km", the5k)).toBe(true);
    expect(cardioFormDiffers({ ...f, duration: "30" }, "km", the5k)).toBe(false);
    expect(cardioFormDiffers({ ...f, type: "walking" }, "km", the5k)).toBe(true);
  });
});

describe("Regulars editor form", () => {
  it("round-trips a strength template", () => {
    const f = templateToRegularForm(legDay, KG, keys());
    expect(f.exercises[0]).toMatchObject({ sets: "3", reps: "10", time: "", weight: "40" });
    const r = regularFormToPayload(f, KG);
    expect(r).toEqual({
      ok: true,
      payload: {
        id: TPL_ID,
        name: "Leg Day",
        notes: null,
        type: "strength",
        exercises: [
          { exerciseId: SQUAT.id, targetSets: 3, targetReps: 10, targetDurationSec: null, targetWeightKg: 40 },
          { exerciseId: PLANK.id, targetSets: 2, targetReps: null, targetDurationSec: 60, targetWeightKg: null },
        ],
      },
    });
  });

  it("round-trips a run in miles", () => {
    const f = templateToRegularForm(the5k, LB_MI, keys());
    expect(f).toMatchObject({ distance: "3.11", duration: "30:00" });
    const r = regularFormToPayload(f, LB_MI);
    expect(r.ok && r.payload).toMatchObject({ type: "running", targetDistanceM: 5005, targetDurationSec: 1800 });
  });

  it("allows a run with no targets", () => {
    const r = regularFormToPayload({ ...newRegularForm(NEW_TPL_ID, "walking"), name: "Stroll" }, KG);
    expect(r.ok && r.payload).toMatchObject({ type: "walking", targetDistanceM: null, targetDurationSec: null });
  });

  it("reports errors with the API's keys", () => {
    const f = newRegularForm(NEW_TPL_ID);
    expect(regularFormToPayload(f, KG)).toEqual({
      ok: false,
      errors: { name: "Give your regular a name", exercises: "Add at least one exercise" },
    });
    const bad = {
      ...f,
      name: "x",
      exercises: [{ ...newRegularExercise(SQUAT, "k"), sets: "0", reps: "abc", time: "99:00", weight: "-1" }],
    };
    const r = regularFormToPayload(bad, KG);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.errors).sort()).toEqual([
        "exercises.0.targetDurationSec",
        "exercises.0.targetReps",
        "exercises.0.targetSets",
        "exercises.0.targetWeightKg",
      ]);
    const run = { ...newRegularForm(NEW_TPL_ID, "running"), name: "x", distance: "999", duration: "nope" };
    const rr = regularFormToPayload(run, KG);
    expect(!rr.ok && Object.keys(rr.errors).sort()).toEqual(["targetDistanceM", "targetDurationSec"]);
  });
});

describe("card lines", () => {
  it("strength lines and tagline", () => {
    expect(templateLines(legDay, KG)).toEqual([
      { label: "BARBELL SQUAT", value: "3×10 · 40 KG" },
      { label: "PLANK", value: "2×1:00 · BW" },
    ]);
    expect(templateTagline(legDay, KG)).toBe("2 ITEMS · 5 SETS");
    expect(targetLine(te({ exercise: SQUAT, targetSets: 1 }), "lb")).toBe("1 SET · BW");
    expect(targetLine(te({ exercise: SQUAT, targetReps: 10, targetWeightKg: 20 }), "lb")).toBe("3×10 · 44.1 LB");
  });

  it("cardio lines and tagline", () => {
    expect(templateLines(the5k, KG)).toEqual([
      { label: "DISTANCE", value: "5.0 KM" },
      { label: "TARGET", value: "~30 MIN" },
    ]);
    expect(templateTagline(the5k, KG)).toBe("5.0 KM · ~30 MIN");
    expect(templateTagline(template({ type: "walking" }), KG)).toBe("OPEN ORDER");
  });

  it("ring-up links go to the right slip", () => {
    expect(ringUpHref(the5k)).toBe(`/log/run?regular=${TPL_ID}`);
    expect(ringUpHref({ id: TPL_ID, type: "walking" })).toBe(`/log/walk?regular=${TPL_ID}`);
    expect(ringUpHref(legDay)).toBe(`/log/strength?regular=${TPL_ID}`);
  });
});
