import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/supabase/proxy";

describe("isPublicPath", () => {
  it("allows the sign-in page and auth callbacks without a session", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/auth/sign-out")).toBe(true);
  });
  it("protects everything else", () => {
    for (const p of ["/", "/week", "/api/activities", "/sign-inx", "/authors"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});
