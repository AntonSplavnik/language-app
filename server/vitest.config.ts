import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Live tests call the real Claude API and cost money; they run only via `pnpm test:live`.
    exclude: ["test/**/*.live.test.ts"],
    globalSetup: ["test/helpers/global-setup.ts"],
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
  },
});
