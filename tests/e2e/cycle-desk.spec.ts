import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Profile → Cycle desk: mark period days on the week strip, flip a switch,
 * STAMP IT, and see it all survive a reload. Other specs share this user, so
 * the days and switches are put back afterwards.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function resetCycle(request: APIRequestContext) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const res = await request.get(`/api/period-days?from=${from}&to=${to}`);
  if (res.ok()) {
    const { dates } = (await res.json()) as { dates: string[] };
    for (const d of dates) await request.delete(`/api/period-days/${d}`);
  }
  await request.patch("/api/cycle/prefs", { data: { circleLedgers: true, circleProgress: true } });
}

test.beforeEach(async ({ page }) => resetCycle(page.request));
test.afterEach(async ({ page }) => resetCycle(page.request));

test("log period days and the circle switches", async ({ page }) => {
  await page.goto("/profile");
  const desk = page.getByRole("form", { name: "Cycle desk" });
  await expect(desk.getByText("log the blood bank's opening days")).toBeVisible();
  await expect(desk.getByText("ONLY YOU SEE THIS. THE BLOOD BANK IS PRIVATE.")).toBeVisible();
  await expect(desk.getByText("REMIND ME", { exact: false })).toHaveCount(0);

  // Fits a 390px phone without sideways scrolling.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // The first day of this week is never in the future.
  const strip = desk.getByRole("group", { name: /TAP YOUR PERIOD DAYS/ });
  const first = strip.getByRole("button").first();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(desk.getByTestId("cycle-count")).toHaveText("1 DAY MARKED");
  await expect(desk.getByLabel("DAY 1")).not.toHaveValue("");

  // No later week than this one; an earlier week, then back.
  await expect(desk.getByRole("button", { name: "LATER WEEK ›" })).toHaveCount(0);
  await desk.getByRole("button", { name: "‹ EARLIER WEEK" }).click();
  await expect(desk.getByTestId("cycle-count")).toHaveText("0 DAYS MARKED");
  await desk.getByRole("button", { name: "LATER WEEK ›" }).click();
  await expect(desk.getByTestId("cycle-count")).toHaveText("1 DAY MARKED");

  // One switch off.
  const ledgers = desk.getByRole("checkbox", { name: "CIRCLE IT ON MY LEDGERS" });
  await expect(ledgers).toBeChecked();
  await desk.getByText("CIRCLE IT ON MY LEDGERS").click();
  await expect(ledgers).not.toBeChecked();

  await desk.getByRole("button", { name: "STAMP IT" }).click();
  await expect(desk.getByRole("status")).toHaveText(/STAMPED/);

  await page.reload();
  const again = page.getByRole("form", { name: "Cycle desk" });
  await expect(again.getByRole("group", { name: /TAP YOUR PERIOD DAYS/ }).getByRole("button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(again.getByRole("checkbox", { name: "CIRCLE IT ON MY LEDGERS" })).not.toBeChecked();
  await expect(again.getByRole("checkbox", { name: "CIRCLE IT ON PROGRESS CHARTS" })).toBeChecked();
});
