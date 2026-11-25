import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { addDays, shortDate, todayIn } from "@/lib/domain/dates";
import { createTestUser, signIn, type TestUser } from "./support/auth";

// Cycle tracking happy path (PRD 4.3 / technical design §14):
// first sign-in → onboarding → log a period → the cycle slip updates.

const TZ = "Asia/Kolkata"; // matches playwright.config timezoneId

async function snap(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

let user: TestUser;
test.afterEach(async () => {
  await user?.remove();
});

test("first sign-in goes through onboarding, then logging a period updates the cycle slip", async ({ page }, info) => {
  user = await createTestUser(info.project.name);
  const today = todayIn(TZ);
  const start = addDays(today, -3);
  const end = addDays(today, -1);

  // First sign-in lands on onboarding, remembering where we were going.
  await signIn(page, user, "/cycle");
  await expect(page).toHaveURL(/\/onboarding\?next=%2Fcycle$/);
  await expect(page.getByTestId("disclaimer")).toContainText("not medical advice");
  await snap(page, info, "onboarding");

  // Pages redirect to onboarding until it is done.
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/onboarding\?next=%2Fsettings$/);

  await page.getByLabel("NAME ON THE TAB").fill("Test Runner");
  await page.getByRole("button", { name: "OPEN MY TAB" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.goto("/cycle");

  // Empty slip.
  await expect(page.getByText("Nothing on the slip yet.")).toBeVisible();
  await snap(page, info, "cycle-empty");

  // Log a 3-day period that ended yesterday, heavy on day 1.
  await page.getByRole("button", { name: "+ LOG PERIOD" }).click();
  const sheet = page.getByRole("dialog", { name: "Log a period" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("STARTED").fill(start);
  await sheet.getByLabel("ENDED (OR TODAY)").fill(end);
  await sheet.getByRole("radiogroup", { name: `Flow on ${shortDate(start)}` }).getByLabel("Heavy").check({ force: true });
  await snap(page, info, "log-sheet");
  await sheet.getByRole("button", { name: "SAVE PERIOD" }).click();
  await expect(sheet).toBeHidden();

  // The slip now shows day 4 of the cycle, a menstrual phase estimate and a predicted next period.
  await expect(page.getByTestId("cycle-day")).toContainText("DAY 4");
  await expect(page.getByTestId("cycle-phase")).toContainText("MENSTRUAL");
  await expect(page.getByTestId("next-period")).toContainText(`~${shortDate(addDays(start, 28))}`);
  await expect(page.getByTestId("period-log")).toContainText(
    `${shortDate(start)} – ${shortDate(end)} · 3 DAYS`,
  );
  await expect(page.getByTestId("period-log")).toContainText("FLOW H · ·");
  await expect(page.getByTestId("phase-band").locator("li[data-period]")).toHaveCount(3);
  await expect(page.getByTestId("phase-band").locator('li[aria-current="date"]')).toHaveAttribute("data-predicted", "true");
  await snap(page, info, "cycle-logged");

  // The API agrees.
  const summary = await (await page.request.get("/api/cycle/summary")).json();
  expect(summary.summary).toMatchObject({ cycleDay: 4, currentCycleStart: start, isEstimate: true });
  const logged = await (await page.request.get(`/api/period-days?from=${start}&to=${today}`)).json();
  expect(logged.days).toEqual([
    { date: start, flow: "heavy" },
    { date: addDays(start, 1), flow: null },
    { date: end, flow: null },
  ]);

  // Edit → clear the period: back to an empty slip.
  await page.getByRole("button", { name: `Edit period starting ${shortDate(start)}` }).click();
  const edit = page.getByRole("dialog", { name: "Edit period" });
  page.once("dialog", (d) => d.accept());
  await edit.getByRole("button", { name: "CLEAR THIS PERIOD" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("Nothing on the slip yet.")).toBeVisible();

  // Tapping today on the calendar marks it as a period day.
  const todayCell = page.locator(`button[data-date="${today}"]`);
  await todayCell.click();
  await expect(todayCell).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("cycle-day")).toContainText("DAY 1");
});

test("settings: track periods only turns phase predictions off", async ({ page }, info) => {
  user = await createTestUser(`${info.project.name}-settings`);
  const today = todayIn(TZ);
  const res = await page.request.get("/sign-in"); // warm up
  expect(res.ok()).toBeTruthy();
  await signIn(page, user, "/");
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("NAME ON THE TAB").fill("Settings Runner");
  await page.getByRole("button", { name: "OPEN MY TAB" }).click();
  await expect(page).not.toHaveURL(/onboarding/);

  // Log a period through the API so the slip has data.
  const put = await page.request.put("/api/period-days", {
    data: { action: "set", from: addDays(today, -2), to: today, flow: "medium" },
  });
  expect(put.ok()).toBeTruthy();

  await page.goto("/settings");
  await expect(page.getByLabel("NAME", { exact: true })).toHaveValue("Settings Runner");
  await page.getByText("TRACK PERIODS ONLY (NO PHASE PREDICTIONS)").click();
  await page.getByRole("button", { name: "SAVE CHANGES" }).click();
  await expect(page.getByRole("status")).toContainText("SAVED");
  await snap(page, info, "settings");

  await page.goto("/cycle");
  await expect(page.getByTestId("cycle-summary")).toContainText("PERIODS ONLY");
  await expect(page.getByTestId("cycle-day")).toContainText("DAY 3");
  await expect(page.getByTestId("next-period")).toHaveCount(0);
  await expect(page.getByTestId("cycle-phase")).toContainText("MENSTRUAL");
  await snap(page, info, "cycle-periods-only");
});
