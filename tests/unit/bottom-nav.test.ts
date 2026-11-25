import { describe, expect, it } from "vitest";
import { isActive, isLedgerPath, LEDGER_ITEMS } from "@/components/bottom-nav";

describe("bottom nav", () => {
  it("offers Day, Month and Year in the ledger pop-up", () => {
    expect(LEDGER_ITEMS.map((i) => [i.label, i.href])).toEqual([
      ["DAY", "/day"],
      ["MONTH", "/month"],
      ["YEAR", "/year"],
    ]);
  });

  it("marks HOME only on the home page", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/profile", "/")).toBe(false);
    expect(isActive("/profile", "/profile")).toBe(true);
  });

  it("lights the ledger button on every ledger, Week included", () => {
    for (const p of ["/day", "/week", "/month", "/year"]) expect(isLedgerPath(p)).toBe(true);
    for (const p of ["/", "/profile", "/regulars", "/log/run", "/days", "/yearly"]) expect(isLedgerPath(p)).toBe(false);
  });
});
