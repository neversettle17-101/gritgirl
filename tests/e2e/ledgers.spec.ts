import { readFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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

// ---------------------------------------------------------------------------
// Period days (CycWeek / CycMonth). There is no period-day UI to drive here,
// so the rows go in with the service-role client for the signed-in user (read
// from the Supabase auth cookie in the stored state), in a past month no
// other spec touches.

function signedInUserId(): string {
  const { cookies } = JSON.parse(readFileSync("tests/e2e/.auth/user.json", "utf8")) as {
    cookies: { name: string; value: string }[];
  };
  // sb-<ref>-auth-token, possibly chunked as .0, .1 …
  const parts = cookies
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => Number(a.name.split(".")[1] ?? 0) - Number(b.name.split(".")[1] ?? 0))
    .map((c) => c.value);
  const raw = decodeURIComponent(parts.join(""));
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64url").toString("utf8") : raw;
  return (JSON.parse(json) as { user: { id: string } }).user.id;
}

const PERIOD = ["2026-03-24", "2026-03-25"]; // Tue, Wed

test.describe("period days on the ledgers", () => {
  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  let userId: string;

  test.beforeAll(async () => {
    test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "needs SUPABASE_SERVICE_ROLE_KEY to insert period days");
    userId = signedInUserId();
    const db = admin();
    const ins = await db.from("period_days").upsert(PERIOD.map((date) => ({ user_id: userId, date })));
    if (ins.error) throw ins.error;
    const on = await db.from("user_settings").update({ cycle_circle_ledgers: true }).eq("user_id", userId);
    if (on.error) throw on.error;
  });

  test.afterAll(async () => {
    if (!userId) return;
    const db = admin();
    await db.from("period_days").delete().eq("user_id", userId).in("date", PERIOD);
    await db.from("user_settings").update({ cycle_circle_ledgers: true }).eq("user_id", userId);
  });

  test("week and month circle them, and the switch turns that off", async ({ page }) => {
    // Week: both rows get the red note, the legend gains PERIOD, the chart a drop per day.
    await page.goto("/week?date=2026-03-24");
    await expect(page.getByText("23 – 29 MAR")).toBeVisible();
    const tue = visible(page.locator("tr[data-period-day='1']"));
    await expect(tue).toContainText("TUE");
    await expect(tue).toContainText("BLOOD BANK DOWN · DAY 1");
    await expect(visible(page.locator("tr[data-period-day='2']"))).toContainText("BLOOD BANK DOWN · DAY 2");
    await expect(visible(page.locator("tr[data-period-day]"))).toHaveCount(2);
    await expect(visible(page.getByText("PERIOD", { exact: true }))).toBeVisible();
    await expect(visible(page.getByTestId("week-chart")).getByTestId("period-tick")).toHaveCount(2);

    // Month: tinted, circled cells with the period day in their label; the
    // caption turns red; the summary has the span.
    await page.goto("/month?date=2026-03-01");
    await expect(page.getByText("MAR 2026")).toBeVisible();
    const cell = visible(page.getByRole("link", { name: /^24 March: .*, period day 1$/ }));
    await expect(cell).toHaveAttribute("data-period-day", "1");
    await expect(visible(page.getByRole("link", { name: /^25 March: .*, period day 2$/ }))).toBeVisible();
    await cell.hover();
    const caption = visible(page.getByTestId("month-caption"));
    await expect(caption).toHaveText("TUE 24 · BLOOD BANK DOWN (DAY 1) · REST DAY · NO CHARGE");
    await expect(caption).toHaveClass(/text-blood/);
    await expect(visible(page.getByTestId("month-blood-bank"))).toHaveText(/BLOOD BANK DOWN\s*24 – 25 MAR/);

    // Switch off: no marks anywhere.
    const off = await admin().from("user_settings").update({ cycle_circle_ledgers: false }).eq("user_id", userId);
    if (off.error) throw off.error;
    await page.goto("/month?date=2026-03-02");
    await expect(page.getByText("MAR 2026")).toBeVisible();
    await expect(visible(page.locator("a[data-period-day]"))).toHaveCount(0);
    await expect(visible(page.getByTestId("month-blood-bank"))).toHaveCount(0);
    await page.goto("/week?date=2026-03-25");
    await expect(page.getByText("23 – 29 MAR")).toBeVisible();
    await expect(visible(page.locator("tr[data-period-day]"))).toHaveCount(0);
  });
});
