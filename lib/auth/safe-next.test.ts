import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/week?date=2026-11-24")).toBe("/week?date=2026-11-24");
    expect(safeNextPath("/day#top")).toBe("/day#top");
  });
  it("falls back for empty, absolute or protocol-relative targets", () => {
    for (const bad of [null, undefined, "", "week", "https://evil.com", "//evil.com", "/\\evil.com", "/\tx"]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
  it("uses the provided fallback", () => {
    expect(safeNextPath("//evil.com", "/sign-in")).toBe("/sign-in");
  });
});
