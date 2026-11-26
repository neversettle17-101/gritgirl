import { describe, expect, it } from "vitest";
import { isActive, isLedgerPath, LEDGER_ITEMS } from "@/components/bottom-nav";

describe("bottom nav", () => {
  it("offers Day, Week and Month in the ledger pop-up", () => {
    expect(LEDGER_ITEMS.map((i) => [i.label, i.href])).toEqual([
      ["DAY", "/day"],
      ["WEEK", "/week"],
      ["MONTH", "/month"],
    ]);
  });

  it("marks HOME only on the home page", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/profile", "/")).toBe(false);
    expect(isActive("/profile", "/profile")).toBe(true);
  });

  it("lights the ledger button on every ledger, Year included", () => {
    for (const p of ["/day", "/week", "/month", "/year"]) expect(isLedgerPath(p)).toBe(true);
    for (const p of ["/", "/profile", "/regulars", "/log/run", "/days", "/yearly"]) expect(isLedgerPath(p)).toBe(false);
  });
});
