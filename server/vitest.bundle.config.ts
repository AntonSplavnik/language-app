import { defineConfig } from "vitest/config";

// The bundle test (docs/design.md §13): the Vercel build output and the bundled function, started
// with plain Node against the test database. It needs `pnpm build:vercel` first, so it runs as
// `pnpm test:bundle` (which builds), not in `pnpm test`.
export default defineConfig({
  test: {
    include: ["test/**/*.bundle.test.ts"],
    globalSetup: ["test/helpers/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
