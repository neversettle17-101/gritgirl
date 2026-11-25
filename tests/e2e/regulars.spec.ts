import { expect, test, type Page } from "@playwright/test";

/**
 * Regulars (M4, phone viewport): set one up, ring it up from the Regulars
 * screen or Home, finish the slip, and watch "USED n×" go up. Also: save a
 * slip as a new regular, last-session pre-fill, update and archive.
 */

const tag = () => Math.random().toString(36).slice(2, 7).toUpperCase();

async function printReceipt(page: Page) {
  await page.getByRole("button", { name: /PRINT RECEIPT/ }).click();
  await expect(page.getByRole("heading", { name: /Printed/ })).toBeVisible();
}

function card(page: Page, name: string) {
  return page.getByRole("list", { name: "Regulars" }).getByRole("listitem").filter({ hasText: name });
}

test("create a run regular, ring it up, finish: used count goes up and it can be updated", async ({ page }) => {
  const name = `E2E Loop ${tag()}`;

  await page.goto("/regulars");
  await expect(page.getByRole("heading", { name: "Your regulars" })).toBeVisible();
  await page.getByRole("link", { name: "+ NEW REGULAR" }).click();
  await expect(page.getByRole("heading", { name: /A new/ })).toBeVisible();
  await page.getByRole("button", { name: "RUN", exact: true }).click();
  await page.getByLabel("NAME").fill(name);
  await page.getByLabel("DISTANCE (KM)").fill("4");
  await page.getByLabel("TARGET TIME").fill("25");
  await page.getByRole("button", { name: "SAVE REGULAR" }).click();

  await expect(page).toHaveURL(/\/regulars$/);
  await expect(card(page, name)).toContainText("USED 0×");
  await expect(card(page, name)).toContainText("4.0 KM");
  await expect(card(page, name)).toContainText("~25 MIN");

  // Ring it up: the run slip opens pre-filled from the targets.
  await card(page, name).getByRole("link", { name: `Ring up ${name}` }).click();
  await expect(page.getByRole("heading", { name: /One run/ })).toBeVisible();
  await expect(page.getByText(`FROM REGULAR: ${name.toUpperCase()}`)).toBeVisible();
  await expect(page.getByLabel("Distance in km")).toHaveValue("4");
  await expect(page.getByLabel("DURATION")).toHaveValue("25:00");
  // Unchanged → no update offer yet.
  await expect(page.getByRole("button", { name: /UPDATE REGULAR/ })).toHaveCount(0);

  // Ran a bit longer: offer to update the regular, and take it.
  await page.getByLabel("DURATION").fill("26:10");
  await page.getByRole("button", { name: new RegExp(`UPDATE REGULAR .${name}.`, "i") }).click();
  await printReceipt(page);

  await page.goto("/regulars");
  await expect(card(page, name)).toContainText("USED 1×");
  await expect(card(page, name)).toContainText("~26 MIN");

  // Home: THE USUAL? shows it; ring it up again from there.
  await page.goto("/");
  const usual = page.getByRole("list", { name: "Your regulars" });
  await expect(usual.getByRole("link", { name: `Ring up ${name}` })).toContainText("USED 1×");
  await usual.getByRole("link", { name: `Ring up ${name}` }).click();
  await expect(page.getByLabel("DURATION")).toHaveValue("26:10");
  await printReceipt(page);

  await page.goto("/regulars");
  await expect(card(page, name)).toContainText("USED 2×");
});

test("save a strength slip as a new regular, ring it up pre-filled from last time, then archive it", async ({ page }) => {
  const t = tag();
  const name = `E2E Legs ${t}`;
  // A fresh custom exercise, so "last time" is only what this test logs
  // (library exercises carry history from the other specs).
  const ex = `E2E Thrust ${t}`;

  await page.goto("/log/strength");
  await expect(page.getByRole("heading", { name: /Heavy items/ })).toBeVisible();
  await page.getByRole("button", { name: "+ ADD AN ITEM" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("SEARCH EXERCISES").fill(ex);
  await dialog.getByRole("button", { name: "CREATE & ADD" }).click();
  await page.getByLabel(`Set 1 reps for ${ex}`).fill("8");
  await page.getByLabel(`Set 1 weight in kg for ${ex}`).fill("42.5");
  await page.getByRole("button", { name: `Add a set of ${ex}` }).click();
  await expect(page.getByLabel(`Set 2 reps for ${ex}`)).toHaveValue("8");

  // Save as a new regular needs a name.
  await page.getByRole("button", { name: "SAVE AS A NEW REGULAR" }).click();
  await page.getByRole("button", { name: /PRINT RECEIPT/ }).click();
  await expect(page.getByText("Give your regular a name")).toBeVisible();
  await page.getByLabel("NAME").fill(name);
  await printReceipt(page);

  // This workout counts as its first use.
  await page.goto("/regulars");
  await expect(card(page, name)).toContainText("USED 1×");
  await expect(card(page, name)).toContainText(ex.toUpperCase());
  await expect(card(page, name)).toContainText("2×8 · 42.5 KG");

  // Ring it up: sets come from the last session.
  await card(page, name).getByRole("link", { name: `Ring up ${name}` }).click();
  await expect(page.getByRole("heading", { name: /Heavy items/ })).toBeVisible();
  await expect(page.getByText(`FROM REGULAR: ${name.toUpperCase()}`)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^${ex}\\s*2 × 8 reps`, "i") }).click();
  await expect(page.getByLabel(`Set 2 reps for ${ex}`)).toHaveValue("8");
  await expect(page.getByLabel(`Set 2 weight in kg for ${ex}`)).toHaveValue("42.5");
  await printReceipt(page);

  await page.goto("/regulars");
  await expect(card(page, name)).toContainText("USED 2×");

  // Delete = archive: gone from the menu, past workouts untouched.
  await card(page, name).getByRole("link", { name: `Edit ${name}` }).click();
  await expect(page.getByRole("heading", { name: /Change the/ })).toBeVisible();
  await page.getByRole("button", { name: "DELETE REGULAR" }).click();
  await page.getByRole("button", { name: /TAP AGAIN/ }).click();
  await expect(page).toHaveURL(/\/regulars$/);
  await expect(card(page, name)).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByRole("link", { name: /STRENGTH 1 ITEM/ }).first()).toBeVisible();
});
