import { defineConfig } from "vitest/config";

// The backup test (docs/design.md §13, §18.6): a backup's whole round trip on throwaway databases,
// with the workflow's own dump script, age and PostgreSQL 17's pg_dump and pg_restore. Those aren't
// installed everywhere `pnpm test` runs, so it runs as `pnpm test:backup` (CI installs them first).
export default defineConfig({
  test: {
    include: ["test/**/*.backup.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
