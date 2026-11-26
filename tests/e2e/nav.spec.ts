import { expect, test, type Locator } from "@playwright/test";

/** Bottom bar: HOME · ledger pop-up (DAY / WEEK / MONTH) · PROFILE. */

const visible = (l: Locator) => l.filter({ visible: true });

test("the ledger button pops up Day, Week and Month", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Main" });
  const button = bar.getByRole("button", { name: "Ledgers" });
  const popup = bar.getByRole("list", { name: "Ledgers" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(popup).toBeHidden();

  // Opens with focus on the first option; arrow keys move along; Escape closes.
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(popup.getByRole("link")).toHaveText([/DAY/, /WEEK/, /MONTH/]);
  await expect(popup.getByRole("link", { name: "DAY" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(popup.getByRole("link", { name: "WEEK" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // Keyboard: Enter opens it, Tab reaches the options.
  await page.keyboard.press("Enter");
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("link", { name: "DAY" })).toBeFocused();

  // A tap outside closes it.
  await visible(page.getByRole("heading", { level: 1 })).click();
  await expect(popup).toBeHidden();

  // Choosing a ledger navigates and closes it; the button shows we're on a ledger.
  await button.click();
  await popup.getByRole("link", { name: "WEEK" }).click();
  await expect(page).toHaveURL(/\/week$/);
  await expect(visible(page.getByRole("heading", { name: /Weekly\s+statement/ }))).toBeVisible();
  await expect(popup).toBeHidden();
  await button.click();
  await expect(popup.getByRole("link", { name: "WEEK" })).toHaveAttribute("aria-current", "page");
  await expect(popup.getByRole("link", { name: "WEEK" })).toBeFocused();
  await popup.getByRole("link", { name: "MONTH" }).click();
  await expect(visible(page.getByRole("heading", { name: /Monthly\s+ledger/ }))).toBeVisible();

  // Year is no longer in the bar, but the Month ledger links to it; the
  // ledger button stays lit there.
  await expect(bar.getByRole("link", { name: "YEAR" })).toHaveCount(0);
  await visible(page.getByRole("link", { name: "YEAR VIEW →" })).click();
  await expect(visible(page.getByRole("heading", { name: /Yearly\s+ledger/ }))).toBeVisible();
  await expect(button).toHaveClass(/bg-yellow/);
  await button.click();
  await popup.getByRole("link", { name: "DAY" }).click();
  await expect(visible(page.getByRole("heading", { name: /Today's\s+receipt/ }))).toBeVisible();

  // Home on the left, profile on the right.
  await bar.getByRole("link", { name: "PROFILE" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(bar.getByRole("link", { name: "PROFILE" })).toHaveAttribute("aria-current", "page");
  await bar.getByRole("link", { name: "HOME" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(bar.getByRole("link", { name: "HOME" })).toHaveAttribute("aria-current", "page");
});
