import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Dogfood the report on this repo's own adapter tests.
    reporters: ["default", "./src/adapters/vitest-reporter.ts"],
  },
});
