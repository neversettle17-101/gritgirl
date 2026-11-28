import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Per-exercise progress (phone viewport): log a strength regular in two
 * different weeks and see the week-by-week change on the progress page,
 * the Progress overview and the slip's "vs prev week" hint. Period days
 * (no Profile input needed) are written straight to period_days with the
 * service-role key, to see the "blood bank down" circle on the chart.
 */

const tag = () => Math.random().toString(36).slice(2, 7).toUpperCase();

/** Today in the test user's time zone (user_settings default: Asia/Kolkata), minus `days`. */
function localDate(days = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function printReceipt(page: Page) {
  await page.getByRole("button", { name: /PRINT RECEIPT/ }).click();
  await expect(page.getByRole("heading", { name: /Printed/ })).toBeVisible();
}

test("log a regular in two weeks, then see the change on the progress page", async ({ page }) => {
  const t = tag();
  const name = `E2E Push ${t}`;
  // A fresh custom exercise, so its history is only what this test logs.
  const ex = `E2E Press ${t}`;

  // Week 1 (seven days ago, so always the previous week): 8 × 40 kg, saved as a regular.
  await page.goto("/log/strength");
  await expect(page.getByRole("heading", { name: /Heavy items/ })).toBeVisible();
  await page.getByLabel("DATE", { exact: true }).fill(localDate(7));
  await page.getByRole("button", { name: "+ ADD AN ITEM" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("SEARCH EXERCISES").fill(ex);
  await dialog.getByRole("button", { name: "CREATE & ADD" }).click();
  await page.getByLabel(`Set 1 reps for ${ex}`).fill("8");
  await page.getByLabel(`Set 1 weight in kg for ${ex}`).fill("40");
  await page.getByRole("button", { name: "SAVE AS A NEW REGULAR" }).click();
  await page.getByLabel("NAME").fill(name);
  await printReceipt(page);

  // The receipt links each exercise to its progress: one week so far.
  await page.getByRole("link", { name: `Progress for ${ex}` }).click();
  await expect(page.getByRole("heading", { name: ex })).toBeVisible();
  await expect(page.getByText(/Log it again next week to see progress/)).toBeVisible();
  await expect(page.getByTestId("week-row")).toHaveCount(1);
  await expect(page.getByTestId("progress-chart")).toHaveCount(0);
  const progressUrl = page.url();

  // Week 2 (today): ring the regular up from the Regulars screen, it is
  // pre-filled from last time, and the slip hints at last week's numbers.
  await page.goto("/regulars");
  const card = page.getByRole("list", { name: "Regulars" }).getByRole("listitem").filter({ hasText: name });
  await card.getByRole("link", { name: `Ring up ${name}` }).click();
  await expect(page.getByText(`FROM REGULAR: ${name.toUpperCase()}`)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^${ex}\\s*1 × 8 reps`, "i") }).click();
  await expect(page.getByTestId("progress-hint")).toContainText("TOP SET 40 KG × 8");
  await expect(page.getByLabel(`Set 1 weight in kg for ${ex}`)).toHaveValue("40");
  await page.getByLabel(`Set 1 weight in kg for ${ex}`).fill("42.5");
  await printReceipt(page);

  // The progress page now shows the change week on week and overall.
  await page.getByRole("link", { name: `Progress for ${ex}` }).click();
  await expect(page).toHaveURL(progressUrl);
  await expect(page.getByTestId("latest-primary")).toHaveText("42.5 KG × 8");
  await expect(page.getByTestId("week-row")).toHaveCount(2);
  const thisWeek = page.getByTestId("week-row").first();
  await expect(thisWeek).toContainText("THIS WEEK");
  await expect(thisWeek).toContainText("+2.5 KG");
  await expect(thisWeek).toContainText("+20 KG"); // volume 340 vs 320
  await expect(page.getByTestId("week-row").last()).toContainText("LAST WEEK");
  await expect(page.getByTestId("overall-change")).toContainText("+2.5 KG");
  await expect(page.getByTestId("progress-chart")).toBeVisible();

  // The overview (from the Regulars screen) lists it, trending up.
  await page.goto("/regulars");
  await page.getByRole("link", { name: /SEE YOUR PROGRESS BY EXERCISE/ }).click();
  await expect(page.getByRole("heading", { name: "Your progress" })).toBeVisible();
  const row = page.getByRole("link", { name: `Progress for ${ex}` });
  await expect(row).toContainText("+2.5 KG");
  await expect(row.locator("[data-trend]")).toHaveAttribute("data-trend", "up");
  await row.click();
  await expect(page).toHaveURL(progressUrl);
});

test("the Profile page links to the progress overview", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("link", { name: /YOUR PROGRESS/ }).click();
  await expect(page.getByRole("heading", { name: "Your progress" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to profile" })).toBeVisible();
});

/** Service-role client for writing period days directly (the same key global-setup signs in with). */
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** "28 NOV" for a YYYY-MM-DD date. */
const dayMonth = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][Number(iso.slice(5, 7)) - 1]}`;

async function logSet(page: Page, ex: string, date: string, kg: string, create: boolean) {
  await page.goto("/log/strength");
  await expect(page.getByRole("heading", { name: /Heavy items/ })).toBeVisible();
  await page.getByLabel("DATE", { exact: true }).fill(date);
  await page.getByRole("button", { name: "+ ADD AN ITEM" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("SEARCH EXERCISES").fill(ex);
  if (create) await dialog.getByRole("button", { name: "CREATE & ADD" }).click();
  else await dialog.getByRole("button", { name: new RegExp(`^${ex}`, "i") }).first().click();
  await page.getByLabel(`Set 1 reps for ${ex}`).fill("8");
  await page.getByLabel(`Set 1 weight in kg for ${ex}`).fill(kg);
  await printReceipt(page);
}

test("a week with a session on a period day is circled on the progress chart", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the service-role key to write period days");
  const ex = `E2E Row ${tag()}`;
  const today = localDate(0);

  // Two weeks of a fresh exercise; today's session is a dip.
  await logSet(page, ex, localDate(7), "30", true);
  await page.getByRole("link", { name: `Progress for ${ex}` }).click();
  await expect(page.getByRole("heading", { name: ex })).toBeVisible();
  const progressUrl = page.url();
  const exerciseId = progressUrl.split("/progress/")[1]!.split(/[?#]/)[0]!;
  await logSet(page, ex, today, "25", false);

  // Today is a logged period day (and so is yesterday, with no session: not listed).
  const db = admin();
  const owner = await db.from("exercises").select("owner_user_id").eq("id", exerciseId).single();
  expect(owner.error).toBeNull();
  const userId = (owner.data as { owner_user_id: string }).owner_user_id;
  const rows = [localDate(1), today].map((date) => ({ user_id: userId, date }));
  expect((await db.from("period_days").upsert(rows, { onConflict: "user_id,date" })).error).toBeNull();

  try {
    await page.goto(progressUrl);
    await expect(page.getByTestId("week-row")).toHaveCount(2);
    const chart = page.getByTestId("progress-chart");
    await expect(chart).toHaveAttribute("aria-label", /circled/);
    await expect(chart.getByTestId("period-point")).toHaveCount(1);
    await expect(chart.getByText("BLOOD BANK DOWN", { exact: true })).toHaveCount(1);
    const notes = page.getByTestId("period-notes");
    // Only the period day that had a session is listed.
    await expect(notes.getByText(/^BLOOD BANK DOWN · /)).toHaveText(`BLOOD BANK DOWN · ${dayMonth(today)}`);
    await expect(notes).toContainText("DIPS INSIDE A RED CIRCLE DON'T COUNT AGAINST YOU. BLOOD BANK WAS CLOSED FOR REPAIRS.");
    await expect(page.getByTestId("week-row").first()).toContainText("(period day)");
    await expect(page.getByTestId("week-row").last()).not.toContainText("(period day)");

    // The overview marks the row whose latest week had a period day.
    await page.goto("/progress");
    await expect(page.getByRole("link", { name: `Progress for ${ex}` }).getByTestId("period-week")).toHaveCount(1);

    // Switch "circle it on progress charts" off: no circles, no note.
    expect(
      (await db.from("user_settings").upsert({ user_id: userId, cycle_circle_progress: false }, { onConflict: "user_id" })).error,
    ).toBeNull();
    await page.goto(progressUrl);
    await expect(page.getByTestId("progress-chart")).toBeVisible();
    await expect(page.getByTestId("period-point")).toHaveCount(0);
    await expect(page.getByTestId("period-notes")).toHaveCount(0);
    await expect(page.getByTestId("progress-chart")).not.toHaveAttribute("aria-label", /circled/);
  } finally {
    await db.from("period_days").delete().eq("user_id", userId).in("date", rows.map((r) => r.date));
    await db.from("user_settings").update({ cycle_circle_progress: true }).eq("user_id", userId);
  }
});
