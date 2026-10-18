import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.http.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
