import { expect, test, type Page } from "@playwright/test";

/**
 * One happy path per activity type (phone viewport): log it from Home, see
 * the printed receipt, then edit / delete-with-undo along the way.
 */

async function printReceipt(page: Page, button = /PRINT RECEIPT/) {
  await page.getByRole("button", { name: button }).click();
  await expect(page.getByRole("heading", { name: /Printed/ })).toBeVisible();
}

test("log a run: derived pace, printed receipt, edit it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /ringing up today/ })).toBeVisible();
  await page.getByRole("link", { name: "RUN per km →" }).click();

  await expect(page.getByRole("heading", { name: /One run/ })).toBeVisible();
  await page.getByRole("button", { name: "More distance" }).click();
  await expect(page.getByLabel("Distance in km")).toHaveValue("0.1");
  await page.getByLabel("Distance in km").fill("5.2");
  await page.getByLabel("DURATION").fill("31:04");
  await page.getByLabel("AVG HEART RATE").fill("152");
  await page.getByRole("button", { name: "SPICY" }).click();
  await page.getByLabel("COMMENTS").fill("hill repeats");
  await expect(page.getByTestId("pace")).toHaveText("5:58 /KM");

  await printReceipt(page);
  await expect(page.locator("[aria-current=true]")).toContainText("RUN");
  await expect(page.locator("[aria-current=true]")).toContainText("31 MIN");
  await expect(page.locator("[aria-current=true]")).toContainText("5.20 KM · 5:58 /KM · 152 BPM · FELT SPICY · NEW");

  // Edit: fix the duration.
  await page.getByRole("link", { name: /EDIT IT/ }).click();
  await expect(page.getByRole("heading", { name: /Fixing the/ })).toBeVisible();
  await expect(page.getByLabel("DURATION")).toHaveValue("31:04");
  await page.getByLabel("DURATION").fill("30:00");
  await printReceipt(page, /REPRINT RECEIPT/);
  await expect(page.locator("[aria-current=true]")).toContainText("30 MIN");

  await page.getByRole("link", { name: "BACK HOME" }).click();
  await expect(page.getByRole("link", { name: /RUN 5.20 KM/ }).first()).toBeVisible();
});

test("log a walk, then void it with undo", async ({ page }) => {
  await page.goto("/log/walk");
  await expect(page.getByRole("heading", { name: /One walk/ })).toBeVisible();
  await page.getByLabel("Distance in km").fill("3");
  await page.getByLabel("DURATION").fill("35");
  await printReceipt(page);
  await expect(page.locator("[aria-current=true]")).toContainText("WALK");
  await expect(page.locator("[aria-current=true]")).toContainText("35 MIN");
  const receiptUrl = page.url().replace("?printed=1", "");

  // Void → undo: still there.
  await page.goto(receiptUrl);
  await page.getByRole("button", { name: /VOID/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("status").filter({ hasText: "VOIDED WALK" })).toBeVisible();
  await expect(page.getByText("WALK 3.00 KM")).toHaveCount(0);
  await page.getByRole("button", { name: "UNDO" }).click();
  await expect(page.getByText("WALK 3.00 KM")).toBeVisible();
  await page.reload();
  await expect(page.getByText("WALK 3.00 KM")).toBeVisible();

  // Void for real: gone after the undo window.
  await page.goto(receiptUrl);
  const deleted = page.waitForResponse((r) => r.request().method() === "DELETE", { timeout: 10_000 });
  await page.getByRole("button", { name: /VOID/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "VOIDED WALK" })).toBeVisible();
  // The DELETE is only sent once the ~5 s undo window has passed.
  expect((await deleted).status()).toBe(204);
  await page.reload();
  await expect(page.getByText("WALK 3.00 KM")).toHaveCount(0);
  const res = await page.request.get(receiptUrl.replace("/activities/", "/api/activities/"));
  expect(res.status()).toBe(404);
});

test("log a strength workout: search, sets, draft survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "STRENGTH per set →" }).click();
  await expect(page.getByRole("heading", { name: /Heavy items/ })).toBeVisible();

  // Typo-tolerant search.
  await page.getByRole("button", { name: "+ ADD AN ITEM" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("SEARCH EXERCISES").fill("barbell squt");
  const squat = dialog.getByRole("button", { name: /^Barbell Squat\b/ }).first();
  await expect(squat).toBeVisible();
  await squat.click();

  await page.getByLabel("Set 1 reps for Barbell Squat").fill("8");
  await page.getByLabel("Set 1 weight in kg for Barbell Squat").fill("40");
  await page.getByRole("button", { name: "Add a set of Barbell Squat" }).click();
  // A new set copies the previous one.
  await expect(page.getByLabel("Set 2 reps for Barbell Squat")).toHaveValue("8");
  await expect(page.getByLabel("Set 2 weight in kg for Barbell Squat")).toHaveValue("40");

  // A time-tracked exercise defaults to time.
  await page.getByRole("button", { name: "+ ADD AN ITEM" }).click();
  await dialog.getByLabel("SEARCH EXERCISES").fill("plank");
  await dialog.getByRole("button", { name: /^Plank\b.*TIMED$/ }).first().click();
  await page.getByLabel("Set 1 time for Plank").fill("60");

  // The compact line per item.
  await expect(page.getByRole("button", { name: /BARBELL SQUAT\s*\d+ × 8 reps/i })).toBeVisible();

  // Reload: the draft is still there.
  await page.reload();
  await expect(page.getByText("PICKED UP WHERE YOU LEFT OFF")).toBeVisible();
  await expect(page.getByRole("list", { name: "Items" }).getByRole("listitem")).toHaveCount(2);

  await page.getByLabel("DURATION").fill("43");
  await page.getByRole("button", { name: "SOLID" }).click();
  await printReceipt(page);
  const mine = page.locator("[aria-current=true]");
  await expect(mine).toContainText("STRENGTH");
  await expect(mine).toContainText("43 MIN");
  await expect(mine).toContainText(/\d+ × 8 reps · 40 KG/);
  await expect(mine).toContainText("1 × 1:00 · BW");
  await expect(mine).toContainText("FELT SOLID");

  // Saved drafts are cleared.
  await page.goto("/log/strength");
  await expect(page.getByText("Nothing on the slip yet")).toBeVisible();
});
