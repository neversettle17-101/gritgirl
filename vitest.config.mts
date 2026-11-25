import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Unit tests live both in tests/unit and next to the code in lib/.
    include: ["tests/unit/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
