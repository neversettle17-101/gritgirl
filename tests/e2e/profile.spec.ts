import { expect, test, type Locator } from "@playwright/test";

/**
 * Profile: about-you details, unit settings and body weight. Other specs
 * share this user and expect kg / km, so the units are put back afterwards.
 */

const visible = (l: Locator) => l.filter({ visible: true });

test.afterEach(async ({ page }) => {
  await page.request.patch("/api/profile", { data: { weightUnit: "kg", distanceUnit: "km" } });
});

test("save profile details and log body weight", async ({ page }) => {
  const name = `Tester ${Date.now() % 100000}`;
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Validation: out-of-range height is caught before saving.
  const about = page.getByRole("form", { name: "ABOUT YOU" });
  await about.getByLabel("HEIGHT").fill("20");
  await about.getByRole("button", { name: "SAVE DETAILS" }).click();
  await expect(about.getByText("Height should be between 50 and 272 cm")).toBeVisible();

  // About you.
  await about.getByLabel("NAME").fill(name);
  await about.getByLabel("HEIGHT").fill("165");
  await about.getByLabel("DATE OF BIRTH").fill("1995-06-01");
  await about.getByRole("button", { name: "SAVE DETAILS" }).click();
  await expect(about.getByRole("status")).toHaveText(/SAVED/);
  await expect(visible(page.getByTestId("profile-name"))).toHaveText(name);
  await expect(visible(page.getByTestId("profile-height"))).toHaveText("165 CM");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);

  // Body weight: a weigh-in today becomes the current weight.
  const weight = page.getByRole("region", { name: "BODY WEIGHT" });
  await weight.getByLabel("WEIGHT · KG").fill("62.4");
  await weight.getByRole("button", { name: "LOG WEIGHT" }).click();
  await expect(weight.getByTestId("current-weight")).toHaveText("62.4 KG");
  await expect(weight.getByRole("list", { name: "Recent weigh-ins" })).toContainText("62.4 KG");

  // Same day again replaces it.
  await weight.getByLabel("WEIGHT · KG").fill("62.0");
  await weight.getByRole("button", { name: "LOG WEIGHT" }).click();
  await expect(weight.getByTestId("current-weight")).toHaveText("62.0 KG");

  // Switching to lb / mi re-expresses what's shown (stored values unchanged).
  await about.getByText("LB", { exact: true }).click();
  await about.getByText("MI", { exact: true }).click();
  await expect(about.getByLabel("Height, feet")).toHaveValue("5");
  await expect(about.getByLabel("Height, inches")).toHaveValue("5");
  await about.getByRole("button", { name: "SAVE DETAILS" }).click();
  await expect(about.getByRole("status")).toHaveText(/SAVED/);
  await expect(weight.getByTestId("current-weight")).toHaveText("136.7 LB");
  await expect(visible(page.getByTestId("profile-height"))).toHaveText("5′ 5″");

  // Survives a reload.
  await page.reload();
  await expect(page.getByRole("form", { name: "ABOUT YOU" }).getByLabel("NAME")).toHaveValue(name);
  await expect(page.getByRole("radio", { name: "LB" })).toBeChecked();

  // Sign-out lives here too.
  await expect(page.getByRole("button", { name: "SIGN OUT" })).toBeVisible();
});
