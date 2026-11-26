import { expect, test, type Locator } from "@playwright/test";

/**
 * Ledgers (§8): a run logged today shows up on the Day receipt, the Week
 * statement and the Month ledger, and in the home shortcut numbers. Other
 * specs share this user, so assertions target this run's own details.
 */

// With cacheComponents, recently visited routes stay mounted but hidden, so
// match only what is on screen.
const visible = (l: Locator) => l.filter({ visible: true });

const minutes = async (text: string | null) => Number((text ?? "").replace(/\D/g, "") || "0");

test("log a run, then find it in the day, week, month and year ledgers", async ({ page }) => {
  const note = `ledger check ${Date.now()}`;
  await page.goto("/");
  const dayBefore = await minutes(await visible(page.getByTestId("home-day")).textContent());

  // Log it.
  await page.goto("/log/run");
  await expect(page.getByRole("heading", { name: /One run/ })).toBeVisible();
  await page.getByLabel("Distance in km").fill("7.31");
  await page.getByLabel("DURATION").fill("41:00");
  await page.getByLabel("AVG HEART RATE").fill("149");
  await page.getByLabel("COMMENTS").fill(note);
  await page.getByRole("button", { name: /PRINT RECEIPT/ }).click();
  await expect(page.getByRole("heading", { name: /Printed/ })).toBeVisible();

  // Day ledger, from the printed receipt.
  await page.getByRole("link", { name: "SEE TODAY'S LEDGER" }).click();
  await expect(page).toHaveURL(/\/day\?date=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole("heading", { name: /Today's\s+receipt/ })).toBeVisible();
  const item = page.getByRole("list", { name: "Items" }).getByRole("listitem").filter({ hasText: note });
  await expect(item).toContainText("RUN");
  await expect(item).toContainText("41 MIN");
  await expect(item).toContainText("7.31 KM · 41:00 · 5:37 /KM · 149 BPM");
  await expect(page.getByText(/STREAK BONUS/)).toBeVisible();
  const dayTotal = await minutes(await visible(page.getByTestId("day-total")).textContent());
  expect(dayTotal).toBeGreaterThanOrEqual(41);

  // Tap to edit reuses the edit slip.
  await item.getByRole("link", { name: "Edit run" }).click();
  await expect(page.getByRole("heading", { name: /Fixing the/ })).toBeVisible();
  await expect(visible(page.getByLabel("Distance in km"))).toHaveValue("7.31");

  // Week statement: today's row has the run, and the total includes it.
  await page.goto("/week");
  await expect(page.getByRole("heading", { name: /Weekly\s+statement/ })).toBeVisible();
  const todayRow = visible(page.locator("tr[aria-current=date]"));
  await expect(todayRow).toContainText("RUN");
  expect(await minutes(await todayRow.locator("td").last().textContent())).toBe(dayTotal);
  expect(await minutes(await visible(page.getByTestId("week-total")).textContent())).toBeGreaterThanOrEqual(dayTotal);
  await expect(page.getByTestId("week-chart").locator(".recharts-bar-rectangle").first()).toBeAttached();

  // Month ledger, from the bottom bar's ledger pop-up: today's cell has an R
  // marker; tapping it opens the day.
  await page.getByRole("button", { name: "Ledgers" }).click();
  await page.getByRole("link", { name: "MONTH", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Monthly\s+ledger/ })).toBeVisible();
  const todayCell = visible(page.locator("a[aria-current=date]"));
  await expect(todayCell).toHaveAttribute("aria-label", /RUN.*TODAY/);
  await expect(todayCell).toContainText("R");
  expect(await minutes(await visible(page.getByTestId("month-total")).textContent())).toBeGreaterThanOrEqual(1);
  await todayCell.click();
  await expect(page.getByRole("heading", { name: /Today's\s+receipt/ })).toBeVisible();

  // Year ledger, from the Month ledger's header: this month's row counts it,
  // and so does the year total.
  await page.getByRole("button", { name: "Ledgers" }).click();
  await page.getByRole("link", { name: "MONTH", exact: true }).click();
  await visible(page.getByRole("link", { name: "YEAR VIEW →" })).click();
  await expect(page.getByRole("heading", { name: /Yearly\s+ledger/ })).toBeVisible();
  const monthRow = visible(page.locator("tr[aria-current=date]"));
  expect(await minutes(await monthRow.locator("td").last().textContent())).toBeGreaterThanOrEqual(dayTotal);
  expect(await minutes(await visible(page.getByTestId("year-total")).textContent())).toBeGreaterThanOrEqual(1);

  // Home shortcut numbers are live.
  await page.getByRole("link", { name: "HOME", exact: true }).click();
  await expect
    .poll(async () => minutes(await visible(page.getByTestId("home-day")).textContent()))
    .toBeGreaterThanOrEqual(dayBefore + 41);
  expect(await minutes(await visible(page.getByTestId("home-month")).textContent())).toBeGreaterThanOrEqual(1);
});

test("ledger pages step back and forward", async ({ page }) => {
  await page.goto("/week?date=2026-01-07");
  await expect(page.getByText("5 – 11 JAN")).toBeVisible();
  await page.getByRole("link", { name: /Previous week/ }).click();
  await expect(page.getByText("29 DEC – 4 JAN")).toBeVisible();

  await page.goto("/month?date=2026-02-14");
  await expect(page.getByText("FEB 2026")).toBeVisible();
  await page.getByRole("link", { name: /Next month/ }).click();
  await expect(page.getByText("MAR 2026")).toBeVisible();

  await page.goto("/year?date=2026-02-14");
  await expect(page.getByRole("heading", { name: /Yearly\s+ledger/ })).toBeVisible();
  await page.getByRole("link", { name: "Previous year, 2025" }).click();
  await expect(page).toHaveURL(/\/year\?date=2025-01-01/);
  await page.getByRole("link", { name: "December 2025 ledger" }).click();
  await expect(page.getByText("DEC 2025")).toBeVisible();

  // The weekly statement is reachable from the month.
  await page.getByRole("link", { name: "WEEK BY WEEK →" }).click();
  await expect(page.getByRole("heading", { name: /Weekly\s+statement/ })).toBeVisible();

  await page.goto("/day?date=2026-02-14");
  await expect(page.getByRole("heading", { name: /Saturday's\s+receipt/ })).toBeVisible();
  await expect(page.getByText("REST DAY · NO CHARGE")).toBeVisible();
});
