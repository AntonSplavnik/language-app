import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Live tests call the real Claude API and cost money; they run only via `pnpm test:live`.
    // Bundle tests need the Vercel build; they run via `pnpm test:bundle`, which builds first.
    // Backup tests need age and PostgreSQL 17's client; they run via `pnpm test:backup`.
    exclude: ["test/**/*.live.test.ts", "test/**/*.bundle.test.ts", "test/**/*.backup.test.ts"],
    globalSetup: ["test/helpers/global-setup.ts"],
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
  },
});
