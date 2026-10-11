import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Live tests call the real Claude API and cost money; they run only via `pnpm test:live`.
    exclude: ["test/**/*.live.test.ts"],
  },
});
