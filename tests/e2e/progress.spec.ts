import { expect, test, type Page } from "@playwright/test";

/**
 * Per-exercise progress (phone viewport): log a strength regular in two
 * different weeks and see the week-by-week change on the progress page,
 * the Progress overview and the slip's "vs prev week" hint.
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
